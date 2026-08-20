import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseSync, StatementSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";

export interface BotConfigRecord {
  id: number;
  system_prompt: string;
  trigger_key: string;
  is_active_globally: number;
  updated_at: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  is_active: number;
  custom_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: number;
  group_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_from_bot: number;
  timestamp: number;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: DatabaseSync;

  // Cached prepared statements
  private stmts!: {
    getConfig: StatementSync;
    updateConfig: StatementSync;
    getGroup: StatementSync;
    insertGroup: StatementSync;
    updateGroupName: StatementSync;
    getAllGroups: StatementSync;
    setGroupActive: StatementSync;
    setGroupPrompt: StatementSync;
    getUser: StatementSync;
    insertUser: StatementSync;
    updateUserName: StatementSync;
    insertMessage: StatementSync;
    getRecentMessages: StatementSync;
  };

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  onModuleInit() {
    const dbPath = this.configService.get<string>("sqliteDbPath", "./data/chatbot.db");
    const dir = path.dirname(dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.initTables();
    this.prepareStatements();
    this.logger.log(`💾 SQLite initialized at ${dbPath}`);
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        system_prompt TEXT NOT NULL,
        trigger_key TEXT NOT NULL,
        is_active_globally INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_active INTEGER DEFAULT 1,
        custom_prompt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT,
        content TEXT NOT NULL,
        is_from_bot INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_group_time ON messages (group_id, timestamp DESC);
    `);

    // Ensure default config exists
    const defaultPrompt =
      this.configService.get<string>("defaultSystemPrompt") ||
      "You are a helpful group chat assistant.";
    const defaultTrigger = this.configService.get<string>("defaultTriggerKey") || "!bot";

    const checkConfig = this.db.prepare("SELECT * FROM bot_config WHERE id = 1");
    const config = checkConfig.get();
    if (!config) {
      const insertConfig = this.db.prepare(
        "INSERT INTO bot_config (id, system_prompt, trigger_key, is_active_globally) VALUES (1, ?, ?, 1)",
      );
      insertConfig.run(defaultPrompt, defaultTrigger);
    }
  }

  private prepareStatements() {
    this.stmts = {
      getConfig: this.db.prepare("SELECT * FROM bot_config WHERE id = 1"),
      updateConfig: this.db.prepare(
        "UPDATE bot_config SET system_prompt = ?, trigger_key = ?, is_active_globally = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ),
      getGroup: this.db.prepare("SELECT * FROM groups WHERE id = ?"),
      insertGroup: this.db.prepare("INSERT INTO groups (id, name, is_active) VALUES (?, ?, 1)"),
      updateGroupName: this.db.prepare(
        "UPDATE groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      getAllGroups: this.db.prepare("SELECT * FROM groups ORDER BY updated_at DESC"),
      setGroupActive: this.db.prepare(
        "UPDATE groups SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      setGroupPrompt: this.db.prepare(
        "UPDATE groups SET custom_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      getUser: this.db.prepare("SELECT * FROM users WHERE id = ?"),
      insertUser: this.db.prepare("INSERT INTO users (id, name) VALUES (?, ?)"),
      updateUserName: this.db.prepare(
        "UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      insertMessage: this.db.prepare(
        "INSERT INTO messages (group_id, sender_id, sender_name, content, is_from_bot, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
      ),
      getRecentMessages: this.db.prepare(
        "SELECT * FROM messages WHERE group_id = ? ORDER BY timestamp DESC LIMIT ?",
      ),
    };
  }

  saveMessage(msg: Partial<MessageRecord>): MessageRecord {
    const result = this.stmts.insertMessage.run(
      msg.group_id,
      msg.sender_id,
      msg.sender_name || null,
      msg.content,
      msg.is_from_bot ? 1 : 0,
      msg.timestamp || Date.now(),
    );
    return { ...msg, id: Number(result.lastInsertRowid) } as MessageRecord;
  }

  getRecentMessages(groupId: string, limit = 50): MessageRecord[] {
    return this.stmts.getRecentMessages.all(groupId, limit) as MessageRecord[];
  }

  getConfig(): BotConfigRecord {
    return this.stmts.getConfig.get() as BotConfigRecord;
  }

  updateConfig(prompt: string, triggerKey: string, isActiveGlobally = 1) {
    this.stmts.updateConfig.run(prompt, triggerKey, isActiveGlobally);
  }

  upsertGroup(id: string, name?: string) {
    const existing = this.stmts.getGroup.get(id) as GroupRecord | undefined;
    if (!existing) {
      this.stmts.insertGroup.run(id, name || id);
    } else if (name && existing.name !== name) {
      this.stmts.updateGroupName.run(name, id);
    }
  }

  getGroup(id: string): GroupRecord | undefined {
    return this.stmts.getGroup.get(id) as GroupRecord | undefined;
  }

  getAllGroups(): GroupRecord[] {
    return this.stmts.getAllGroups.all() as GroupRecord[];
  }

  setGroupActive(id: string, isActive: boolean) {
    this.stmts.setGroupActive.run(isActive ? 1 : 0, id);
  }

  setGroupPrompt(id: string, customPrompt: string | null) {
    this.stmts.setGroupPrompt.run(customPrompt, id);
  }

  upsertUser(id: string, name?: string) {
    const existing = this.stmts.getUser.get(id);
    if (!existing) {
      this.stmts.insertUser.run(id, name || id);
    } else if (name) {
      this.stmts.updateUserName.run(name, id);
    }
  }
}
