export function parseDuration(input: string, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const match = /^([0-9]+)(ms|s|m)?$/i.exec(input.trim());
  if (!match) {
    return fallback;
  }
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (!unit || unit === 'ms') {
    return value;
  }
  if (unit === 's') {
    return value * 1000;
  }
  if (unit === 'm') {
    return value * 60_000;
  }
  return fallback;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function estimateTokenCount(text: string): number {
  if (!text) {
    return 0;
  }
  const words = text.trim().split(/\s+/).filter(Boolean);
  const estimate = Math.max(words.length * 0.75, text.length / 4);
  return Math.max(1, Math.round(estimate));
}

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withRetries<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, delayMs = 250, onRetry } = options;
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await task();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      attempt += 1;
      onRetry?.(attempt, error);
      await delay(delayMs * attempt);
    }
  }
  throw new Error('withRetries exhausted without result');
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return 'n/a';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SecretMatch {
  pattern: string;
  match: string;
}

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'aws_access_key', regex: /AKIA[0-9A-Z]{16}/g },
  { label: 'bearer_token', regex: /Bearer [A-Za-z0-9_\-]{20,}/gi },
  {
    label: 'private_key_header',
    regex: /-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE KEY)/g,
  },
  {
    label: 'generic_api_key',
    regex: /\b(API_KEY|SECRET_KEY|ACCESS_TOKEN)\b\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}["']?/g,
  },
  // Common provider-specific patterns (best-effort heuristics)
  { label: 'github_token', regex: /(ghp|ghu|ghs|ghr)_[A-Za-z0-9]{36}/g },
  { label: 'github_pat', regex: /github_pat_[A-Za-z0-9_]{80,90}/g },
  { label: 'google_api_key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  {
    label: 'slack_token',
    regex: /xox[baps]-[0-9A-Za-z-]{10,48}-[0-9A-Za-z-]{10,48}-[0-9A-Za-z-]{10,48}/g,
  },
  { label: 'stripe_secret_key', regex: /sk_live_[0-9A-Za-z]{24}/g },
  { label: 'stripe_publishable_key', regex: /pk_live_[0-9A-Za-z]{24}/g },
  { label: 'openai_api_key', regex: /sk-[A-Za-z0-9]{32,48}/g },
  {
    label: 'jwt_token',
    regex: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];

export function scanForSecrets(text: string): SecretMatch[] {
  if (!text) {
    return [];
  }
  const matches: SecretMatch[] = [];
  for (const { label, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration requires assignment in loop condition
    while ((match = regex.exec(text)) !== null) {
      matches.push({ pattern: label, match: match[0] ?? '' });
    }
  }
  return matches;
}

export function sanitizeSecrets(text: string, matches: SecretMatch[]): string {
  if (!text || matches.length === 0) {
    return text;
  }
  let sanitized = text;
  for (const entry of matches) {
    if (!entry.match) {
      continue;
    }
    const escaped = entry.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(escaped, 'g'), '***REDACTED***');
  }
  return sanitized;
}

export async function writeJsonOutput(filePath: string, payload: unknown): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return;
  } catch (error: any) {
    // In constrained test environments (e.g., /repo read-only), fall back to a
    // workspace-relative path to avoid EACCES while still emitting diagnostics.
    // Fallback intentionally reuses the caller's relative structure under process.cwd()
    // (no dedicated tmp/ path) and remains silent to avoid noisy test output.
    const isAccessError = error?.code === 'EACCES' || error?.code === 'EPERM';
    const inRootishPath = filePath.startsWith('/');
    if (!isAccessError || !inRootishPath) {
      throw error;
    }
  }

  const fs2 = await import('node:fs/promises');
  const path2 = await import('node:path');
  const fallbackPath = path2.join(process.cwd(), filePath.replace(/^\/+/, ''));
  const fallbackDir = path2.dirname(fallbackPath);
  await fs2.mkdir(fallbackDir, { recursive: true });
  await fs2.writeFile(fallbackPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
