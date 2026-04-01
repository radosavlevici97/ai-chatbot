import { z } from "zod";

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  mode: z.enum(["chat", "devbot"]).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
