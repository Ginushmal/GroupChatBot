import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseService, MessageRecord, SettingsRecord } from "../database/database.service.js";

export interface CacheEntry {
  facts: string[];
  timestamp: number;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private factsCache = new Map<string, CacheEntry>();

  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  private getApiKey(overrideKey?: string | null): string {
    if (overrideKey) return overrideKey;
    const settings = this.dbService.getSettings();
    if (settings?.mem0_api_key) return settings.mem0_api_key;
    return this.configService.get<string>("mem0ApiKey", "");
  }

  /**
   * Save message to local SQLite database (short-term history)
   */
  saveMessage(
    chatId: string,
    senderId: string,
    senderName: string | null,
    content: string,
    source: 'human' | 'bot' = 'human',
  ): MessageRecord {
    return this.dbService.saveMessage({
      chat_id: chatId,
      sender_id: senderId,
      sender_name: senderName,
      content,
      source,
      is_synced: 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieve the last N messages from SQLite for a given chat (in chronological order)
   */
  getRecentContext(chatId: string, limit = 50): MessageRecord[] {
    const rows = this.dbService.getRecentMessages(chatId, limit);
    return rows.reverse();
  }

  /**
   * Check whether the cache should be invalidated based on smart rules
   */
  shouldInvalidateCache(
    chatId: string,
    triggerText: string,
    mentionedJid: string[],
    settings: SettingsRecord,
  ): boolean {
    const cached = this.factsCache.get(chatId);
    if (!cached) return true;

    // 1. TTL Check
    const ttlMs = (settings.cache_ttl_mins || 60) * 60 * 1000;
    if (Date.now() - cached.timestamp > ttlMs) {
      this.logger.debug(`Cache invalidated for ${chatId}: TTL expired (${settings.cache_ttl_mins}m)`);
      return true;
    }

    // 2. Length Threshold Check
    const threshold = settings.trigger_length_threshold || 80;
    if (triggerText.length > threshold) {
      this.logger.debug(`Cache invalidated for ${chatId}: Prompt length (${triggerText.length}) > ${threshold}`);
      return true;
    }

    // 3. Frustration / Correction Keywords Check
    if (settings.frustration_keywords) {
      const keywords = settings.frustration_keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length > 0) {
        const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        const regex = new RegExp(`(${escaped})`, "i");
        if (regex.test(triggerText)) {
          this.logger.debug(`Cache invalidated for ${chatId}: Frustration/correction keyword matched in prompt`);
          return true;
        }
      }
    }

    // 4. Explicit Tagging / Mentions Check
    if (mentionedJid && mentionedJid.length > 0) {
      this.logger.debug(`Cache invalidated for ${chatId}: Explicit mentions present in message`);
      return true;
    }

    return false;
  }

  /**
   * Batch upload unsynced messages to Mem0, grouped by user
   */
  async syncUnsyncedMessages(chatId: string, mem0ApiKey?: string | null): Promise<void> {
    const apiKey = this.getApiKey(mem0ApiKey);
    if (!apiKey) return;

    const unsynced = this.dbService.getUnsyncedMessages(chatId);
    if (unsynced.length === 0) return;

    this.logger.log(`🔄 Bulk-uploading ${unsynced.length} unsynced messages to Mem0 for chat ${chatId}...`);

    // Group messages by sender_id
    const userGroups = new Map<string, { senderName: string; source: string; messages: string[] }>();
    for (const msg of unsynced) {
      const sender = msg.sender_id;
      const name = msg.sender_name || (msg.source === "bot" ? "AI Assistant" : sender.split("@")[0]);
      if (!userGroups.has(sender)) {
        userGroups.set(sender, { senderName: name, source: msg.source, messages: [] });
      }
      userGroups.get(sender)!.messages.push(msg.content);
    }

    const uploadPromises: Promise<any>[] = [];

    for (const [senderId, group] of userGroups.entries()) {
      const compositeUserId = `${senderId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${chatId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const payloadMessages = group.messages.map((content) => ({
        role: group.source === "bot" ? "assistant" : "user",
        content: group.source === "bot" ? `AI Agent said: ${content}` : `${group.senderName} said: ${content}`,
      }));

      uploadPromises.push(
        fetch("https://api.mem0.ai/v1/memories/", {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: payloadMessages,
            user_id: compositeUserId,
            run_id: chatId,
            metadata: {
              user_name: group.senderName,
              sender_id: senderId,
            },
          }),
        }).catch((err) => {
          this.logger.warn(`Failed to batch add to Mem0 for ${senderId}: ${err.message}`);
        }),
      );
    }

    await Promise.allSettled(uploadPromises);
    this.dbService.markMessagesSynced(chatId);
    this.logger.log(`✅ Finished bulk sync for chat ${chatId}`);
  }

  /**
   * Search Mem0 facts for a given chat with strict run_id isolation
   */
  async getFacts(
    chatId: string,
    senderName: string,
    query: string,
    forceRefresh = false,
    settings?: SettingsRecord,
  ): Promise<string[]> {
    const apiKey = this.getApiKey(settings?.mem0_api_key);
    if (!apiKey) {
      this.logger.debug("Mem0 API Key is not configured; skipping memory retrieval.");
      return [];
    }

    if (!forceRefresh && this.factsCache.has(chatId)) {
      this.logger.debug(`Using locally cached Mem0 facts for chat ${chatId}`);
      return this.factsCache.get(chatId)!.facts;
    }

    const formattedQuery = `${senderName} said: ${query}`;
    const facts: string[] = [];

    try {
      this.logger.log(`🔍 Querying Mem0 with strictly scoped run_id for chat ${chatId}...`);
      
      const payload: any = {
        query: formattedQuery,
        run_id: chatId,
        top_k: settings?.mem0_top_k ?? 10,
      };
      
      if (settings?.mem0_threshold !== undefined) {
        payload.threshold = settings.mem0_threshold;
      }
      if (settings?.mem0_rerank) {
        payload.rerank = true;
      }

      const searchRes = await fetch("https://api.mem0.ai/v1/memories/search/", {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (searchRes.ok) {
        const data: any = await searchRes.json();
        const results = Array.isArray(data) ? data : data.results || [];
        for (const item of results) {
          if (item.memory) {
            let memoryText: string = item.memory;
            
            // Resolve author/speaker name
            let speakerName = item.metadata?.user_name;
            if (!speakerName && item.user_id) {
              if (item.user_id.startsWith("bot_")) {
                speakerName = "AI Assistant";
              } else if (item.metadata?.sender_id) {
                speakerName = this.dbService.getUserName(item.metadata.sender_id);
              }
            }

            // If we have a speaker name, replace generic "User" / "user" with the specific person's name
            if (speakerName) {
              memoryText = memoryText
                .replace(/\bUser's\b/g, `${speakerName}'s`)
                .replace(/\buser's\b/g, `${speakerName}'s`)
                .replace(/\bUser\b/g, speakerName)
                .replace(/\buser\b/g, speakerName);
            }

            facts.push(memoryText);
          }
        }
      } else {
        const errText = await searchRes.text();
        this.logger.warn(`Mem0 search returned ${searchRes.status}: ${errText}`);
      }

      // Update local cache
      this.factsCache.set(chatId, {
        facts,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to fetch memories from Mem0: ${err.message}`);
      if (this.factsCache.has(chatId)) {
        return this.factsCache.get(chatId)!.facts;
      }
    }

    return facts;
  }
}
