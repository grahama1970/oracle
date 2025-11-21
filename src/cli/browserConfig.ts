import type { BrowserSessionConfig } from '../sessionManager.js';
import type { ModelName } from '../oracle.js';
import { DEFAULT_MODEL_TARGET, parseDuration } from '../browserMode.js';

const DEFAULT_BROWSER_TIMEOUT_MS = 900_000;
const DEFAULT_BROWSER_INPUT_TIMEOUT_MS = 30_000;
const DEFAULT_CHROME_PROFILE = 'Default';

const BROWSER_MODEL_LABELS: Record<ModelName, string> = {
  // Copilot currently exposes two entries: “GPT-5” and “GPT-5 mini”.
  'gpt-5-pro': 'GPT-5',
  'gpt-5.1': 'GPT-5',
};

export interface BrowserFlagOptions {
  browserChromeProfile?: string;
  browserChromePath?: string;
  browserUrl?: string;
  browserTimeout?: string;
  browserInputTimeout?: string;
  browserNoCookieSync?: boolean;
  browserHeadless?: boolean;
  browserHideWindow?: boolean;
  browserKeepBrowser?: boolean;
  browserRemoteDebugUrl?: string;
  browserRemoteDebugPort?: string;
  browserModelLabel?: string;
  browserAllowCookieErrors?: boolean;
  model: ModelName;
  verbose?: boolean;
}

function normalizeBrowserUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  const hasScheme = /^https?:\/\//i.test(trimmed);
  if (hasScheme) {
    return trimmed;
  }
  // Treat bare host or host+path as HTTPS by default, e.g.:
  //   chatgpt.com -> https://chatgpt.com
  //   github.com/copilot -> https://github.com/copilot
  //   gemini.google.com/app -> https://gemini.google.com/app
  const withoutLeadingSlash = trimmed.replace(/^\/+/, '');
  return `https://${withoutLeadingSlash}`;
}

export function buildBrowserConfig(options: BrowserFlagOptions): BrowserSessionConfig {
  const desiredModelOverride = options.browserModelLabel?.trim();
  const normalizedOverride = desiredModelOverride?.toLowerCase() ?? '';
  const baseModel = options.model.toLowerCase();
  const shouldUseOverride = normalizedOverride.length > 0 && normalizedOverride !== baseModel;
  const remoteDebugUrl = options.browserRemoteDebugUrl ?? process.env.CHROME_REMOTE_DEBUG_URL ?? undefined;
  const remotePortFlag = options.browserRemoteDebugPort
    ? Number(options.browserRemoteDebugPort)
    : process.env.CHROME_REMOTE_DEBUG_PORT
      ? Number(process.env.CHROME_REMOTE_DEBUG_PORT)
      : undefined;
  return {
    chromeProfile: options.browserChromeProfile ?? DEFAULT_CHROME_PROFILE,
    chromePath: options.browserChromePath ?? null,
    url: normalizeBrowserUrl(options.browserUrl),
    timeoutMs: options.browserTimeout ? parseDuration(options.browserTimeout, DEFAULT_BROWSER_TIMEOUT_MS) : undefined,
    inputTimeoutMs: options.browserInputTimeout
      ? parseDuration(options.browserInputTimeout, DEFAULT_BROWSER_INPUT_TIMEOUT_MS)
      : undefined,
    cookieSync: options.browserNoCookieSync ? false : undefined,
    headless: options.browserHeadless ? true : undefined,
    keepBrowser: options.browserKeepBrowser ? true : undefined,
    hideWindow: options.browserHideWindow ? true : undefined,
    remoteDebugUrl,
    remoteDebugPort: remotePortFlag,
    desiredModel: shouldUseOverride ? desiredModelOverride : mapModelToBrowserLabel(options.model),
    debug: options.verbose ? true : undefined,
    allowCookieErrors: options.browserAllowCookieErrors ? true : undefined,
  };
}

export function mapModelToBrowserLabel(model: ModelName): string {
  return BROWSER_MODEL_LABELS[model] ?? DEFAULT_MODEL_TARGET;
}

export function resolveBrowserModelLabel(input: string | undefined, model: ModelName): string {
  const trimmed = input?.trim?.() ?? '';
  if (!trimmed) {
    return mapModelToBrowserLabel(model);
  }
  const normalizedInput = trimmed.toLowerCase();
  if (normalizedInput === model.toLowerCase()) {
    return mapModelToBrowserLabel(model);
  }
  return trimmed;
}
