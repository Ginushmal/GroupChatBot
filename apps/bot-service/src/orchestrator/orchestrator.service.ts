import { Injectable, Logger, Inject, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { LlmService } from "../llm/llm.service.js";
import { WhatsAppService, IncomingMessageEvent } from "../whatsapp/whatsapp.service.js";

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

  private resolveMentions(
    text: string,
    mentionedJid: string[],
    botJids: string[] = [],
    botName = "You",
    allowMentions = true,
  ): string {
    let resolved = text;
    for (const jid of mentionedJid) {
      let replacement = "";
      const phone = jid.split("@")[0];

      if (botJids.includes(jid)) {
        replacement = allowMentions ? "@AI Assistant" : `@${botName}`;
      } else {
        const name = this.dbService.getUserName(jid);
        replacement = name ? `@${name}` : `@${phone}`;
      }

      const before = resolved;
      resolved = resolved.replace(new RegExp(`@${phone}\\b`, "g"), replacement);
      resolved = resolved.replace(new RegExp(`@${jid}\\b`, "g"), replacement);

      if (before === resolved) {
        this.logger.debug(`Could not find mention string for JID ${jid} in text: "${text}"`);
      } else {
        this.logger.debug(`Resolved mention for ${jid} to ${replacement}`);
      }
    }
    return resolved;
  }

  async handleIncomingMessage(payload: IncomingMessageEvent): Promise<void> {
    const {
      chatId,
      chatName,
      senderId,
      senderName,
      text,
      isBotReply,
      mentionedJid,
      isBotMentioned,
      botJids,
      botName,
    } = payload;

    // Ignore messages sent by our own bot process (already logged)
    if (isBotReply) return;

    // 1. Record chat and user in database
    this.dbService.upsertChat(chatId, chatName);
    this.dbService.upsertUser(senderId, senderName);

    // 2. Fetch global and chat configurations
    const settings = this.dbService.getSettings();
    const chat = this.dbService.getChat(chatId);
    const allowsMentions = chat?.allow_mentions !== 0;

    // 3. Resolve mentions in text
    const cleanedText =
      mentionedJid && mentionedJid.length > 0
        ? this.resolveMentions(text, mentionedJid, botJids, botName || "You", allowsMentions)
        : text;

    if (!settings || settings.is_active_globally === 0) {
      this.logger.debug("Bot is globally disabled. Skipping message.");
      return;
    }

    if (chat && chat.is_active === 0) {
      this.logger.debug(`Bot is disabled in chat ${chatId}. Skipping message.`);
      return;
    }

    const effectiveTrigger = chat?.custom_trigger || settings.trigger_key || "!bot";
    const trimmedText = cleanedText.trim();

    const isWordTriggered = trimmedText.toLowerCase().startsWith(effectiveTrigger.toLowerCase());
    const isMentionTriggered = allowsMentions && isBotMentioned;

    const isTriggered = isWordTriggered || isMentionTriggered;

    if (!isTriggered) {
      // Short-term memory: Log regular conversation
      this.memoryService.saveMessage(chatId, senderId, senderName, cleanedText, "human");
      return;
    }

    // Extract user prompt
    let userPrompt = trimmedText;
    if (isWordTriggered) {
      userPrompt = userPrompt.slice(effectiveTrigger.length).trim();
    } else if (isMentionTriggered) {
      // Strip @mention prefix
      userPrompt = userPrompt.replace(/^@\S+\s*/, "").trim();
    }

    if (!userPrompt) {
      userPrompt = "Hello!";
    }

    this.logger.log(`🎯 Trigger matched in chat ${chatId} (${chatName || chatId}) from ${senderName}: "${userPrompt}"`);
    const startTime = Date.now();

    // Save user's trigger message to SQLite (Short-term)
    this.memoryService.saveMessage(chatId, senderId, senderName, cleanedText, "human");

    // 4. Batch upload unsynced messages to Mem0 before retrieval
    try {
      await this.memoryService.syncUnsyncedMessages(chatId, settings.mem0_api_key);
    } catch (err: any) {
      this.logger.warn(`Error during bulk sync: ${err.message}`);
    }

    // 5. Evaluate smart cache invalidation and fetch long-term facts
    const forceRefresh = this.memoryService.shouldInvalidateCache(
      chatId,
      userPrompt,
      mentionedJid,
      settings,
    );
    const facts = await this.memoryService.getFacts(
      chatId,
      senderName,
      userPrompt,
      forceRefresh,
      settings,
    );

    // 6. Fetch short-term context (last X messages from SQLite)
    const recentMessages = this.memoryService.getRecentContext(chatId, settings.short_term_msg_limit ?? 50);

    // 7. Generate LLM reply
    const result = await this.llmService.generateReply({
      systemPrompt: settings.system_prompt,
      customChatPrompt: chat?.custom_prompt,
      facts,
      recentMessages,
      senderName,
      userPrompt,
      apiKey: settings.llm_api_key,
    });

    const latencyMs = Date.now() - startTime;

    if (result.reply) {
      // Send reply to WhatsApp
      await this.whatsAppService.sendMessage(chatId, result.reply);

      // Save bot's reply to SQLite
      this.memoryService.saveMessage(chatId, "bot", "AI Assistant", result.reply, "bot");

      // Save complete invocation to BotInvocations for God-mode Observability
      try {
        this.dbService.saveInvocation({
          chat_id: chatId,
          sender_id: senderId,
          trigger_text: cleanedText,
          system_prompt: settings.system_prompt,
          context_messages: JSON.stringify(
            recentMessages.map((m) => ({
              role: m.source === "bot" ? "assistant" : "user",
              name: m.sender_name,
              content: m.content,
            }))
          ),
          mem0_facts: JSON.stringify(facts),
          model_used: result.modelUsed,
          response_text: result.reply,
          latency_ms: latencyMs,
        });
      } catch (logErr: any) {
        this.logger.warn(`Failed to save bot invocation record: ${logErr.message}`);
      }
    }
  }
}
