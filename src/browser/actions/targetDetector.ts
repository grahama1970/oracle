/**
 * Detect whether we're targeting ChatGPT or GitHub Copilot
 * Based on the URL or hostname
 */

export type PlatformTarget = 'chatgpt' | 'copilot' | 'unknown';

/**
 * Determine if URL is for GitHub Copilot
 */
export function isCopilotUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname.includes('github.com') && url.includes('/copilot');
  } catch {
    return false;
  }
}

/**
 * Determine if URL is for ChatGPT
 */
export function isChatGPTUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com');
  } catch {
    return false;
  }
}

/**
 * Detect which platform we're targeting
 */
export function detectTarget(url: string): PlatformTarget {
  if (isCopilotUrl(url)) return 'copilot';
  if (isChatGPTUrl(url)) return 'chatgpt';
  return 'unknown';
}

/**
 * Get platform-specific constants for selectors
 */
export function getPlatformSelectors(target: PlatformTarget) {
  switch (target) {
    case 'copilot':
      return {
        // Copilot-specific selectors (to be refined based on actual testing)
        inputSelector: [
          'textarea[data-qa="copilot-input"]',
          'textarea[placeholder*="Ask Copilot"]',
          'input[data-testid="copilot-prompt-input"]',
          'textarea[name="question"]',
        ],
        answerSelector: [
          '[data-qa*="answer"]',
          '[data-testid="copilot-response"]',
          '.copilot-markdown',
          '[class*="copilot-response"]',
        ],
        sendButtonSelector: '[data-qa="send-button"]',
        stopButtonSelector: '[data-qa="stop-button"]',
      };

    case 'chatgpt':
    default:
      return {
        // ChatGPT selectors (from constants)
        inputSelector: [
          'textarea[data-id="prompt-textarea"]',
          'textarea[placeholder*="Send a message"]',
          'textarea[aria-label="Message ChatGPT"]',
        ],
        answerSelector: [
          'article[data-testid^="conversation-turn"][data-message-author-role="assistant"]',
          'article[data-testid^="conversation-turn"] .markdown',
        ],
        sendButtonSelector: '[data-testid="send-button"]',
        stopButtonSelector: '[data-testid="stop-button"]',
      };
  }
}