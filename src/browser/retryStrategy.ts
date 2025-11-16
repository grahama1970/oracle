export interface RetryContext {
  attempt: number;
  maxRetries: number;
  followupPrompt: string;
}

export function shouldRetry(hasValidDiff: boolean, attempt: number, maxRetries: number): boolean {
  if (hasValidDiff) {
    return false;
  }
  return attempt < maxRetries;
}

export function buildFollowupPrompt(base: string, override?: string): string {
  if (override && override.trim().length > 0) {
    return override;
  }
  return [
    'Retry: ONLY return a single fenced ```diff block containing a valid unified diff with numeric hunk headers.',
    'No commentary, no prose—just the diff.',
    '',
    base,
  ]
    .join('\n')
    .trim();
}

