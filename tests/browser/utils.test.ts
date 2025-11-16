import { describe, expect, test, vi } from 'vitest';
import {
  parseDuration,
  estimateTokenCount,
  delay,
  withRetries,
  scanForSecrets,
  sanitizeSecrets,
} from '../../src/browser/utils.js';

describe('parseDuration', () => {
  test.each([
    ['500ms', 1234, 500],
    ['5s', 100, 5000],
    ['2m', 100, 120000],
    ['42', 0, 42],
  ])('parses %s with fallback %d', (input, fallback, expected) => {
    expect(parseDuration(input, fallback)).toBe(expected);
  });

  test('falls back for invalid input', () => {
    expect(parseDuration('oops', 987)).toBe(987);
  });
});

describe('estimateTokenCount', () => {
  test('handles empty text', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  test('estimates based on words and chars', () => {
    const short = 'one two three four';
    expect(estimateTokenCount(short)).toBeGreaterThan(0);
    const long = 'a'.repeat(400);
    expect(estimateTokenCount(long)).toBeGreaterThan(estimateTokenCount(short));
  });
});

describe('delay', () => {
  test('resolves after requested time', async () => {
    vi.useFakeTimers();
    const pending = delay(500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('withRetries', () => {
  test('retries failing tasks before succeeding', async () => {
    let attempt = 0;
    const result = await withRetries(async () => {
      attempt += 1;
      if (attempt < 3) {
        throw new Error('nope');
      }
      return 'done';
    }, { retries: 3, delayMs: 1 });
    expect(result).toBe('done');
    expect(attempt).toBe(3);
  });
});

describe('secret scanning helpers', () => {
  test('detects common secret-like patterns', () => {
    const text = `
      AWS key: AKIA1234567890ABCD
      Bearer abcdefghijklmnopqrstuvwxyz0123456789
      API_KEY="supersecret"
    `;
    const matches = scanForSecrets(text);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('sanitizes detected secrets with redaction', () => {
    const text = 'API_KEY="supersecret"';
    const matches = scanForSecrets(text);
    const sanitized = sanitizeSecrets(text, matches);
    expect(sanitized).not.toContain('supersecret');
    expect(sanitized).toContain('***REDACTED***');
  });
});
