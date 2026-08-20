import { Injectable, Logger, Inject, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { LlmService } from "../llm/llm.service.js";
import { WhatsAppService } from "../whatsapp/whatsapp.service.js";

export interface IncomingMessagePayload {
  groupId: string;
  senderId: string;
  senderName: string;
  text: string;
  rawMessage?: any;
}

@Injectable()
export class OrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
  ) {}

  onModuleInit() {
    this.whatsAppService.setIncomingMessageHandler(this.handleIncomingMessage.bind(this));
  }

  async handleIncomingMessage(payload: IncomingMessagePayload): Promise<void> {
    const { groupId, senderId, senderName, text } = payload;

    // 1. Record group and user in database
    this.dbService.upsertGroup(groupId);
    this.dbService.upsertUser(senderId, senderName);

    // 2. Fetch global and group configuration
    const config = this.dbService.getConfig();
    const group = this.dbService.getGroup(groupId);

    if (!config || config.is_active_globally === 0) {
      this.logger.debug("Bot is globally disabled. Skipping message.");
      return;
    }

    if (group && group.is_active === 0) {
      this.logger.debug(`Bot is disabled in group ${groupId}. Skipping message.`);
      return;
    }

    const triggerKey = config.trigger_key || "!bot";
    const trimmedText = text.trim();
    const isTriggered =
      trimmedText.toLowerCase().startsWith(triggerKey.toLowerCase()) ||
      trimmedText.toLowerCase().startsWith("@bot");

    if (!isTriggered) {
      // Short-term memory: Log regular conversation
      this.memoryService.saveMessage(groupId, senderId, senderName, text, false);

      // Long-term memory: Asynchronously update facts in Mem0 for meaningful context
      if (text.length > 20 && !text.startsWith("!")) {
        this.memoryService.addFact(groupId, senderId, `${senderName}: ${text}`).catch(() => {});
      }
      return;
    }

    // Extract the actual user query by stripping trigger
    let userPrompt = trimmedText;
    if (userPrompt.toLowerCase().startsWith(triggerKey.toLowerCase())) {
      userPrompt = userPrompt.slice(triggerKey.length).trim();
    } else if (userPrompt.toLowerCase().startsWith("@bot")) {
      userPrompt = userPrompt.slice(4).trim();
    }

    if (!userPrompt) {
      userPrompt = "Hello!";
    }

    this.logger.log(`🎯 Trigger matched in group ${groupId} from ${senderName}: "${userPrompt}"`);

    // Save user's trigger message to SQLite (Short-term)
    this.memoryService.saveMessage(groupId, senderId, senderName, text, false);

    // Save to Mem0 (Long-term) so the bot learns from direct interactions too
    if (userPrompt.length > 5) {
      this.memoryService.addFact(groupId, senderId, `${senderName} asked the bot: ${userPrompt}`).catch(() => {});
    }

    // Fetch short-term context (last 50 messages)
    const recentMessages = this.memoryService.getRecentContext(groupId, 50);

    // Fetch long-term facts from Mem0
    const facts = await this.memoryService.getFacts(groupId, senderId);

    // Generate LLM reply via Manifest Router
    const reply = await this.llmService.generateReply({
      systemPrompt: config.system_prompt,
      customGroupPrompt: group?.custom_prompt,
      facts,
      recentMessages,
      senderName,
      userPrompt,
    });

    if (reply) {
      // Send message to WhatsApp group
      await this.whatsAppService.sendMessage(groupId, reply);

      // Save bot's reply to SQLite
      this.memoryService.saveMessage(groupId, "bot", "AI Assistant", reply, true);
    }
  }
}
