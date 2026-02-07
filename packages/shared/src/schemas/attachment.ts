import { z } from "zod";

export const imageAttachmentSchema = z.object({
  type: z.literal("image"),
  storagePath: z.string(),
  mimeType: z.string(),
  size: z.number().optional(),
});

export const attachmentSchema = z.discriminatedUnion("type", [
  imageAttachmentSchema,
]);

export const attachmentsArraySchema = z.array(attachmentSchema);

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
