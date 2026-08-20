import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { MessageRecord } from "../database/database.service.js";

export interface GenerateReplyOptions {
  systemPrompt: string;
  customGroupPrompt?: string | null;
  facts: string[];
  recentMessages: MessageRecord[];
  senderName: string;
  userPrompt: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private openai: OpenAI | null = null;
  private model: string;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("manifestApiKey", "");
    const baseURL = this.configService.get<string>(
      "manifestBaseUrl",
      "https://api.manifest.build/v1",
    );
    this.model = this.configService.get<string>("manifestModel", "auto");

    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL,
      });
      this.logger.log(`🤖 Manifest LLM Router configured with model: ${this.model}`);
    } else {
      this.logger.warn(
        "⚠️ MANIFEST_API_KEY is not configured. LLM replies will be disabled until set.",
      );
    }
  }

  async generateReply(options: GenerateReplyOptions): Promise<string> {
    const { systemPrompt, customGroupPrompt, facts, recentMessages, senderName, userPrompt } =
      options;

    if (!this.openai) {
      // Re-check if apiKey was populated dynamically
      const apiKey = this.configService.get<string>(
        "manifestApiKey",
        process.env.MANIFEST_API_KEY || "",
      );
      if (apiKey) {
        this.openai = new OpenAI({
          apiKey,
          baseURL: this.configService.get<string>(
            "manifestBaseUrl",
            "https://api.manifest.build/v1",
          ),
        });
      } else {
        return "⚠️ [Bot is not configured with MANIFEST_API_KEY yet. Please set it in your .env file or Admin UI.]";
      }
    }

    try {
      // 1. Build System Instruction with Persona and Long-Term Memory Facts
      let combinedSystemPrompt = systemPrompt;
      if (customGroupPrompt) {
        combinedSystemPrompt += `\n\n[Group-Specific Instructions]:\n${customGroupPrompt}`;
      }

      if (facts && facts.length > 0) {
        combinedSystemPrompt += `\n\n[Known Memory & Facts about Users/Group]:\n${facts.join("\n")}`;
      }

      combinedSystemPrompt += `\n\nInstructions for group chat:
- You are participating in a group chat.
- Always be aware of who is speaking based on the prefix 'Name: Message'.
- Address members naturally by name when appropriate.
- Keep your tone conversational, concise, and engaging unless requested otherwise.`;

      // 2. Build Message History from last messages
      const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: combinedSystemPrompt },
      ];

      // Add recent context (excluding the very last trigger message to prevent duplication)
      for (const msg of recentMessages) {
        if (msg.is_from_bot) {
          chatMessages.push({
            role: "assistant",
            content: msg.content,
          });
        } else {
          chatMessages.push({
            role: "user",
            content: `${msg.sender_name || "Member"}: ${msg.content}`,
          });
        }
      }

      // Add current user prompt
      chatMessages.push({
        role: "user",
        content: `${senderName}: ${userPrompt}`,
      });

      this.logger.log(`Invoking Manifest LLM Router (${this.model})...`);

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 800,
      });

      const reply = completion.choices[0]?.message?.content?.trim() || "";
      return reply;
    } catch (err: any) {
      this.logger.error(`Error from Manifest LLM router: ${err.message}`, err.stack);
      return `❌ Error generating reply from AI router: ${err.message}`;
    }
  }
}
