export const CHATGPT_URL = 'https://chatgpt.com/';
// Default browser model label used when no override is provided.
// The canonical API model id is `gpt-5.1`, but the ChatGPT UI
// currently surfaces this path as “GPT-5” in the model picker.
export const DEFAULT_MODEL_TARGET = 'GPT-5';
export const COOKIE_URLS = ['https://chatgpt.com', 'https://chat.openai.com', 'https://github.com', 'https://copilot.github.com', 'https://github.com/copilot'];

export const INPUT_SELECTORS = [
  'textarea[data-id="prompt-textarea"]',
  'textarea[placeholder*="Send a message"]',
  'textarea[aria-label="Message ChatGPT"]',
  'textarea:not([disabled])',
  'textarea[name="prompt-textarea"]',
  '#prompt-textarea',
  '.ProseMirror',
  '[contenteditable="true"][data-virtualkeyboard="true"]',
];

export const ANSWER_SELECTORS = [
  'article[data-testid^="conversation-turn"][data-message-author-role="assistant"]',
  'article[data-testid^="conversation-turn"] [data-message-author-role="assistant"]',
  'article[data-testid^="conversation-turn"] .markdown',
  '[data-message-author-role="assistant"] .markdown',
  '[data-message-author-role="assistant"]',
];

// Copilot-specific DOM scopes for assistant markdown and responses. Keeping
// them centralized avoids scattering selector drift fixes across modules.
export const COPILOT_MARKDOWN_SELECTORS = [
  // Exact markdown body for the latest assistant turn (observed 2025-11-17).
  'div.ChatMessage-module__content--sWQll > div.markdown-body.MarkdownRenderer-module__container--dNKcF.MarkdownViewer-module__markdownOverrides--xtpOl[data-copilot-markdown="true"]',
  // Slightly looser but still scoped to markdown bodies Copilot renders.
  'div.markdown-body.MarkdownRenderer-module__container--dNKcF.MarkdownViewer-module__markdownOverrides--xtpOl[data-copilot-markdown="true"]',
  'div.markdown-body.MarkdownRenderer-module__container--dNKcF[data-copilot-markdown="true"]',
  'div.markdown-body[data-copilot-markdown="true"]',
  'div.markdown-body',
];

// Latest assistant message container in Copilot (use exact class chain to avoid sidebar matches).
export const COPILOT_MESSAGE_SELECTORS = [
  // Exact hashed class chain (latest assistant turn)
  'div.message-container.ChatMessage-module__chatMessage--mrG0f.ChatMessage-module__ai--l6YpD.ChatMessage-module__latest--AGxtS',
  // Fallback: any assistant message (keep hashed classes but drop latest)
  'div.message-container.ChatMessage-module__chatMessage--mrG0f.ChatMessage-module__ai--l6YpD',
  // Hash-tolerant match for future rotations
  'div.message-container[class*="ChatMessage-module__chatMessage"][class*="ChatMessage-module__ai"]',
];

// Direct markdown body inside the assistant message container (exact match first, then fall back to COPILOT_MARKDOWN_SELECTORS).
export const COPILOT_MARKDOWN_BODY_SELECTOR =
  'div.ChatMessage-module__content--sWQll > div.markdown-body.MarkdownRenderer-module__container--dNKcF.MarkdownViewer-module__markdownOverrides--xtpOl[data-copilot-markdown="true"]';

// Copilot send/stop button with data-loading flag (used as typing indicator).
export const COPILOT_LOADING_BUTTON_SELECTOR =
  'button.prc-Button-ButtonBase-c50BI.prc-Button-IconButton-szpyj[data-component="IconButton"][data-loading], button[data-component="IconButton"][data-loading]';

// Optional: stop/loading icon inside the send button.
export const COPILOT_STOP_ICON_SELECTOR = 'svg.octicon-square-fill';
export const COPILOT_SEND_ICON_SELECTOR = 'svg.octicon-paper-airplane';

// Copilot conversation container to scope queries away from the sidebar.
export const COPILOT_CONVERSATION_SCOPE_SELECTOR =
  'div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_, div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent';

export const COPILOT_RESPONSE_SELECTORS = [
  '[data-qa*="copilot-answer"]',
  '[data-testid*="copilot-response"]',
  '.copilot-answer',
  '.copilot-response',
  '[data-skip-answer="true"]',
];

export const CONVERSATION_TURN_SELECTOR = 'article[data-testid^="conversation-turn"]';
export const ASSISTANT_ROLE_SELECTOR = '[data-message-author-role="assistant"]';
export const CLOUDFLARE_SCRIPT_SELECTOR = 'script[src*="/challenge-platform/"]';
export const CLOUDFLARE_TITLE = 'just a moment';
export const PROMPT_PRIMARY_SELECTOR = '#prompt-textarea';
export const PROMPT_FALLBACK_SELECTOR = 'textarea[name="prompt-textarea"]';
export const FILE_INPUT_SELECTOR = 'form input[type="file"]:not([accept])';
export const GENERIC_FILE_INPUT_SELECTOR = 'input[type="file"]:not([accept])';
export const MENU_CONTAINER_SELECTOR = '[role="menu"], [data-radix-collection-root]';
export const MENU_ITEM_SELECTOR = 'button, [role="menuitem"], [role="menuitemradio"], [data-testid*="model-switcher-"]';
export const UPLOAD_STATUS_SELECTORS = [
  '[data-testid*="upload"]',
  '[data-testid*="attachment"]',
  '[data-state="loading"]',
  '[aria-live="polite"]',
];

export const STOP_BUTTON_SELECTOR = '[data-testid="stop-button"]';
export const SEND_BUTTON_SELECTOR = '[data-testid="send-button"]';
export const MODEL_BUTTON_SELECTOR = '[data-testid="model-switcher-dropdown-button"]';
export const COPY_BUTTON_SELECTOR = 'button[data-testid="copy-turn-action-button"]';
