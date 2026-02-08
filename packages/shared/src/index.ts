// Schemas
export { registerInputSchema, loginInputSchema } from "./schemas/auth.js";
export type { RegisterInput, LoginInput } from "./schemas/auth.js";

export { sendMessageInputSchema } from "./schemas/chat.js";
export type { SendMessageInput } from "./schemas/chat.js";

export { createConversationSchema, updateConversationSchema } from "./schemas/conversation.js";
export type { CreateConversationInput, UpdateConversationInput } from "./schemas/conversation.js";

export { paginationSchema } from "./schemas/common.js";
export type { PaginationInput } from "./schemas/common.js";

export {
  uploadResponseSchema,
  documentStatusSchema,
  documentListItemSchema,
  documentSearchSchema,
  documentSearchResultSchema,
} from "./schemas/document.js";
export type {
  UploadResponse,
  DocumentStatus,
  DocumentListItem,
  DocumentSearchInput,
  DocumentSearchResult,
} from "./schemas/document.js";

// Types
export type { TokenPair, AuthResponse, UserProfile } from "./types/auth.js";
export type { Message, MessageRole, MessageStatus, StreamChunk } from "./types/chat.js";
export type { Conversation, ConversationListItem, ConversationWithMessages } from "./types/conversation.js";
export type { ApiResponse, ApiError, PaginatedResponse } from "./types/api.js";

export {
  attachmentsArraySchema,
  imageAttachmentSchema,
  attachmentSchema,
} from "./schemas/attachment.js";
export type { ImageAttachment, Attachment } from "./schemas/attachment.js";

// Constants
export { AVAILABLE_MODELS, DEFAULT_MODEL } from "./constants/models.js";
export { LIMITS, IMAGE_LIMITS } from "./constants/limits.js";
export type { AllowedImageMime } from "./constants/limits.js";
