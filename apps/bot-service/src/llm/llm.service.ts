import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { MessageRecord } from "../database/database.service.js";

export interface GenerateReplyOptions {
  systemPrompt: string;
  customChatPrompt?: string | null;
  facts: string[];
  recentMessages: MessageRecord[];
  senderName: string;
  userPrompt: string;
  apiKey?: string | null;
}

export interface GenerateReplyResult {
  reply: string;
  modelUsed: string;
  chatMessages: OpenAI.Chat.ChatCompletionMessageParam[];
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private openai: OpenAI | null = null;
  private currentApiKey: string = "";
  private model: string;
  private baseURL: string;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("manifestApiKey", "");
    this.baseURL = this.configService.get<string>(
      "manifestBaseUrl",
      "https://api.manifest.build/v1",
    );
    this.model = this.configService.get<string>("manifestModel", "auto");

    if (apiKey) {
      this.currentApiKey = apiKey;
      this.openai = new OpenAI({
        apiKey,
        baseURL: this.baseURL,
      });
      this.logger.log(`🤖 Manifest LLM Router configured with model: ${this.model}`);
    }
  }

  async generateReply(options: GenerateReplyOptions): Promise<GenerateReplyResult> {
    const { systemPrompt, customChatPrompt, facts, recentMessages, senderName, userPrompt, apiKey } =
      options;

    const effectiveApiKey =
      apiKey ||
      this.currentApiKey ||
      this.configService.get<string>("manifestApiKey", process.env.MANIFEST_API_KEY || "");

    if (!effectiveApiKey) {
      return {
        reply: "⚠️ [Bot is not configured with MANIFEST_API_KEY / LLM Key yet. Please set it in the Admin UI Config tab.]",
        modelUsed: this.model,
        chatMessages: [],
      };
    }

    if (!this.openai || this.currentApiKey !== effectiveApiKey) {
      this.currentApiKey = effectiveApiKey;
      this.openai = new OpenAI({
        apiKey: effectiveApiKey,
        baseURL: this.baseURL,
      });
    }

    try {
      // 1. Build System Instruction with Persona and Long-Term Memory Facts
      let combinedSystemPrompt = systemPrompt;
      if (customChatPrompt) {
        combinedSystemPrompt += `\n\n[Chat-Specific Instructions]:\n${customChatPrompt}`;
      }

      if (facts && facts.length > 0) {
        combinedSystemPrompt += `\n\n[Known Memory & Facts about Chat Participants]:\n${facts.map((f) => `- ${f}`).join("\n")}`;
      }

      combinedSystemPrompt += `\n\nInstructions:
- You are participating in a group or direct chat.
- Always be aware of who is speaking based on the prefix 'Name: Message'.
- Address members naturally by name when appropriate.
- Keep your tone conversational, concise, and engaging unless requested otherwise.`;

      // 2. Build Message History from last messages
      const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: combinedSystemPrompt },
      ];

      for (const msg of recentMessages) {
        if (msg.source === 'bot') {
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

      this.logger.log(`Invoking LLM Router (${this.model})...`);

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 800,
      });

      const reply = completion.choices[0]?.message?.content?.trim() || "";
      const modelUsed = completion.model || this.model;

      return {
        reply,
        modelUsed,
        chatMessages,
      };
    } catch (err: any) {
      this.logger.error(`Error from LLM router: ${err.message}`, err.stack);
      return {
        reply: `❌ Error generating reply from AI router: ${err.message}`,
        modelUsed: this.model,
        chatMessages: [],
      };
    }
  }
}
