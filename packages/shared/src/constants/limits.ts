export const LIMITS = {
  MESSAGE_MAX_LENGTH: 32_000,
  UPLOAD_MAX_SIZE_MB: 25,
  UPLOAD_MAX_SIZE_BYTES: 25 * 1024 * 1024,
  IMAGE_MAX_SIZE_MB: 10,
  IMAGE_MAX_SIZE_BYTES: 10 * 1024 * 1024,
  IMAGE_MAX_DIMENSION: 4096,
  IMAGES_PER_MESSAGE: 5,
  USERNAME_MIN: 3,
  USERNAME_MAX: 100,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  RATE_LIMIT_AUTH_PER_MINUTE: 10,
  RATE_LIMIT_CHAT_PER_MINUTE: 30,
  RATE_LIMIT_UPLOAD_PER_HOUR: 20,
} as const;

export const IMAGE_LIMITS = {
  maxSizeMB: 10,
  maxSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ] as const,
  allowedExtensions: ["png", "jpg", "jpeg", "gif", "webp"] as const,
  maxImagesPerMessage: 5,
  maxDimensionPx: 4096,
  clientResizeThresholdBytes: 4 * 1024 * 1024,
} as const;

export type AllowedImageMime = (typeof IMAGE_LIMITS.allowedMimeTypes)[number];
