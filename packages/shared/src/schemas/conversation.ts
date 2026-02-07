import { z } from "zod";

export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
  model: z.string().default("gemini-2.5-flash"),
  systemPrompt: z.string().max(10_000).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  systemPrompt: z.string().max(10_000).optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
