import { GoogleGenAI } from "@google/genai";
import { env } from "../env.js";
import { log } from "../middleware/logger.js";

const TITLE_PROMPT = `Generate a short title (max 6 words) for this conversation.
Return ONLY the title, no quotes, no explanation.`;

/**
 * Generate a conversation title using a non-streaming generateContent call.
 * Falls back to "New conversation" on any failure.
 */
export async function generateTitle(
  firstUserMessage: string,
  requestId: string,
): Promise<string> {
  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    const response = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        { role: "user", parts: [{ text: firstUserMessage }] },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 30,
        systemInstruction: TITLE_PROMPT,
      },
    });

    const title = response.text?.trim().slice(0, 100) || "New conversation";

    log.debug({ requestId, title }, "Auto-title generated");
    return title;
  } catch (err) {
    log.warn({ requestId, err: (err as Error).message }, "Title generation failed, using fallback");
    return "New conversation";
  }
}
