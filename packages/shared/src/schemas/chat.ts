import { z } from "zod";

export const sendMessageInputSchema = z.object({
  content: z.string().min(1).max(32_000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(32_000).default(4096),
  useDocuments: z.boolean().default(false),
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
