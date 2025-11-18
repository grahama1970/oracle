import type CDP from 'chrome-remote-interface';
import type Protocol from 'devtools-protocol';

export type ChromeClient = Awaited<ReturnType<typeof CDP>>;
export type CookieParam = Protocol.Network.CookieParam;

export interface ChromeCookiesSecureModule {
  getCookiesPromised: (
    url: string,
    format: 'puppeteer' | 'object',
    profile?: string
  ) => Promise<PuppeteerCookie[] | Record<string, unknown>>;
}

export interface PuppeteerCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  // biome-ignore lint/style/useNamingConvention: matches Puppeteer cookie shape
  Secure?: boolean;
  // biome-ignore lint/style/useNamingConvention: matches Puppeteer cookie shape
  HttpOnly?: boolean;
}

export type BrowserLogger = ((message: string) => void) & {
  verbose?: boolean;
  sessionLog?: (message: string) => void;
};

export interface BrowserAttachment {
  path: string;
  displayPath: string;
  sizeBytes?: number;
}

export interface BrowserAutomationConfig {
  chromeProfile?: string | null;
  chromePath?: string | null;
  url?: string;
  timeoutMs?: number;
  inputTimeoutMs?: number;
  cookieSync?: boolean;
  headless?: boolean;
  keepBrowser?: boolean;
  hideWindow?: boolean;
  desiredModel?: string | null;
  debug?: boolean;
  allowCookieErrors?: boolean;
}

export interface BrowserRunOptions {
  prompt: string;
  attachments?: BrowserAttachment[];
  config?: BrowserAutomationConfig;
  log?: BrowserLogger;
  heartbeatIntervalMs?: number;
  verbose?: boolean;
   // When set, capture assistant DOM snapshots into the active session directory.
  domSnapshotIntervalMs?: number;
  snapshotsDir?: string;
}

export interface BrowserRunResult {
  answerText: string;
  answerMarkdown: string;
  answerHtml?: string;
  tookMs: number;
  answerTokens: number;
  answerChars: number;
  chromePid?: number;
  chromePort?: number;
  userDataDir?: string;
  snapshots?: string[];
  // Optional platform hint (e.g., "chatgpt" or "copilot") for debugging.
  platform?: string;
}

export type DiffRunStatus =
  | 'success'
  | 'timeout'
  | 'error'
  | 'diff_missing'
  | 'partial'
  | 'secret_detected'
  | 'apply_failed'
  | 'commit_failed'
  | 'invalid_diff'
  | 'no_input';

export type ResolvedBrowserConfig = Required<
  Omit<BrowserAutomationConfig, 'chromeProfile' | 'chromePath' | 'desiredModel'>
> & {
  chromeProfile?: string | null;
  chromePath?: string | null;
  desiredModel?: string | null;
};
