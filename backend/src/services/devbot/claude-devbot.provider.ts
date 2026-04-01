import Anthropic from "@anthropic-ai/sdk";
import type { StreamChunk, Repo } from "@chatbot/shared";
import type { ChatMessage, LLMProvider } from "../llm/base.js";
import { devbotTools } from "./tool-definitions.js";
import { executeTool, type ToolContext } from "./tool-executor.js";
import { DEVBOT_SYSTEM_PROMPT } from "./system-prompt.js";
import { getOctokit } from "./token.service.js";
import { log } from "../../middleware/logger.js";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOOL_ROUNDS = 15;

interface DevBotProviderOptions {
  userId: string;
  repo: Repo;
  workingBranch: string | null;
  onBranchCreated: (branch: string) => void;
}

export class ClaudeDevBotProvider implements LLMProvider {
  private client: Anthropic;
  private options: DevBotProviderOptions;

  constructor(apiKey: string, options: DevBotProviderOptions) {
    this.client = new Anthropic({ apiKey });
    this.options = options;
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk> {
    const anthropicMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Build system prompt with repo context
    const systemPrompt = [
      DEVBOT_SYSTEM_PROMPT,
      `\nRepo: ${this.options.repo.githubOwner}/${this.options.repo.githubRepo}`,
      `Default branch: ${this.options.repo.defaultBranch}`,
      this.options.workingBranch ? `Working branch: ${this.options.workingBranch}` : "",
      this.options.repo.language ? `Primary language: ${this.options.repo.language}` : "",
    ].filter(Boolean).join("\n");

    // Tool context for the executor
    let currentBranch = this.options.workingBranch;
    const toolCtx: ToolContext = {
      octokit: getOctokit(this.options.userId),
      repo: this.options.repo,
      workingBranch: currentBranch,
      setWorkingBranch: (branch: string) => {
        currentBranch = branch;
        toolCtx.workingBranch = branch;
        this.options.onBranchCreated(branch);
      },
    };

    // Multi-turn tool loop
    let currentMessages = [...anthropicMessages];
    let toolRound = 0;

    while (toolRound < MAX_TOOL_ROUNDS) {
      toolRound++;

      // Stream the response from Claude
      let response;
      try {
        response = await this.client.messages.create({
          model: options?.model ?? CLAUDE_MODEL,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.7,
          system: systemPrompt,
          tools: devbotTools,
          messages: currentMessages,
          stream: true,
        });
      } catch (err: any) {
        const message = err?.error?.error?.message ?? err?.message ?? "Claude API request failed";
        log.error({ err: message }, "Claude DevBot API error");
        yield { event: "error" as const, error: message, code: "LLM_ERROR" };
        return;
      }

      let textContent = "";
      const toolUseBlocks: { id: string; name: string; input: any }[] = [];
      let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
      let stopReason: string | null = null;

      for await (const event of response) {
        switch (event.type) {
          case "content_block_start":
            if (event.content_block.type === "text") {
              // Text block starting
            } else if (event.content_block.type === "tool_use") {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: "",
              };
            }
            break;

          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              textContent += event.delta.text;
              yield { event: "token", content: event.delta.text };
            } else if (event.delta.type === "input_json_delta" && currentToolUse) {
              currentToolUse.inputJson += event.delta.partial_json;
            }
            break;

          case "content_block_stop":
            if (currentToolUse) {
              let parsedInput = {};
              try {
                parsedInput = currentToolUse.inputJson
                  ? JSON.parse(currentToolUse.inputJson)
                  : {};
              } catch {
                log.warn({ toolName: currentToolUse.name, json: currentToolUse.inputJson }, "Failed to parse tool input JSON");
              }
              toolUseBlocks.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: parsedInput,
              });
              currentToolUse = null;
            }
            break;

          case "message_delta":
            stopReason = event.delta.stop_reason;
            break;
        }
      }

      // If Claude returned tool_use blocks, execute them and continue the loop
      if (stopReason === "tool_use" && toolUseBlocks.length > 0) {
        // Build the assistant message content for the conversation
        const assistantContent: any[] = [];
        if (textContent) {
          assistantContent.push({ type: "text", text: textContent });
        }
        for (const tu of toolUseBlocks) {
          assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
        }

        currentMessages.push({ role: "assistant", content: assistantContent as any });

        // Execute each tool and build tool results
        const toolResults: any[] = [];
        for (const tu of toolUseBlocks) {
          const result = await executeTool(tu.name, tu.input, toolCtx, tu.id);

          // Emit tool call events to the SSE stream
          for (const evt of result.events) {
            yield evt;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: result.output,
            is_error: !result.success,
          });
        }

        currentMessages.push({ role: "user", content: toolResults as any });

        // Reset for next round
        textContent = "";
        continue;
      }

      // end_turn or other stop reason — we're done
      yield {
        event: "done",
        finishReason: stopReason ?? "end_turn",
        usage: undefined,
      };
      break;
    }

    if (toolRound >= MAX_TOOL_ROUNDS) {
      yield {
        event: "error",
        error: "Tool execution limit reached. The bot may be stuck in a loop.",
        code: "TOOL_LOOP_LIMIT",
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Quick check that the API key is valid
      await this.client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
