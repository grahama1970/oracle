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
  { label: 'bearer_token', regex: /Bearer [A-Za-z0-9_\-]{20,}/g },
  {
    label: 'private_key_header',
    regex: /-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE KEY)/g,
  },
  {
    label: 'generic_api_key',
    regex: /\b(API_KEY|SECRET_KEY|ACCESS_TOKEN)\b\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}["']?/g,
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
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
