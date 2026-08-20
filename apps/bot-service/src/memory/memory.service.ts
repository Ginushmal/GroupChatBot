import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseService, MessageRecord } from "../database/database.service.js";

export interface FactItem {
  id?: string;
  memory: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly mem0ApiKey: string;

  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    this.mem0ApiKey = this.configService.get<string>("mem0ApiKey", "");
  }

  /**
   * Save message to local SQLite database (short-term history)
   */
  saveMessage(
    groupId: string,
    senderId: string,
    senderName: string,
    content: string,
    isFromBot: boolean,
  ): void {
    this.dbService.saveMessage({
      group_id: groupId,
      sender_id: senderId,
      sender_name: senderName,
      content,
      is_from_bot: isFromBot ? 1 : 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieve the last N messages from SQLite for a given group (in chronological order)
   */
  getRecentContext(groupId: string, limit = 50): MessageRecord[] {
    const rows = this.dbService.getRecentMessages(groupId, limit);
    // Return in chronological order (getRecentMessages returns DESC)
    return rows.reverse();
  }

  /**
   * Retrieve persistent facts about a user and group from Mem0 Cloud
   */
  async getFacts(groupId: string, senderId: string): Promise<string[]> {
    if (!this.mem0ApiKey) {
      this.logger.debug("MEM0_API_KEY is not configured; skipping long-term memory retrieval.");
      return [];
    }

    const facts: string[] = [];

    try {
      // Query user-level memories
      const userRes = await fetch(
        `https://api.mem0.ai/v1/memories/?user_id=${encodeURIComponent(senderId)}`,
        {
          headers: {
            Authorization: `Token ${this.mem0ApiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (userRes.ok) {
        const userData: any = await userRes.json();
        const userMemories = Array.isArray(userData) ? userData : userData.results || [];
        userMemories.forEach((m: any) => {
          if (m.memory) facts.push(`[User Fact]: ${m.memory}`);
        });
      }

      // Query group-level memories
      const groupRes = await fetch(
        `https://api.mem0.ai/v1/memories/?run_id=${encodeURIComponent(groupId)}`,
        {
          headers: {
            Authorization: `Token ${this.mem0ApiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (groupRes.ok) {
        const groupData: any = await groupRes.json();
        const groupMemories = Array.isArray(groupData) ? groupData : groupData.results || [];
        groupMemories.forEach((m: any) => {
          if (m.memory) facts.push(`[Group Fact]: ${m.memory}`);
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to fetch facts from Mem0: ${err.message}`);
    }

    return facts;
  }

  /**
   * Asynchronously add a conversation snippet to Mem0 to extract and store long-term facts
   */
  async addFact(groupId: string, senderId: string, content: string): Promise<void> {
    if (!this.mem0ApiKey) return;

    try {
      await fetch("https://api.mem0.ai/v1/memories/", {
        method: "POST",
        headers: {
          Authorization: `Token ${this.mem0ApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          user_id: senderId,
          run_id: groupId,
        }),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to add memory to Mem0: ${err.message}`);
    }
  }
}
