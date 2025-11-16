export { navigateToChatGPT, ensureNotBlocked, ensurePromptReady } from './actions/navigation.js';
export { ensureModelSelection } from './actions/modelSelection.js';
export { submitPrompt } from './actions/promptComposer.js';
export { uploadAttachmentFile, waitForAttachmentCompletion } from './actions/attachments.js';
export {
  waitForAssistantResponse,
  readAssistantSnapshot,
  captureAssistantMarkdown,
  buildAssistantExtractorForTest,
  buildConversationDebugExpressionForTest,
} from './actions/assistantResponse.js';

// Copilot-specific exports
export { navigateToCopilot, checkCopilotAuthentication, ensureCopilotPromptReady, waitForCopilotReady, waitForCopilotResponse } from './actions/copilotNavigation.js';
export { detectTarget, getPlatformSelectors } from './actions/targetDetector.js';

