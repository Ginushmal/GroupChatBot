import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseSync, StatementSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";

export interface SettingsRecord {
  id: number;
  llm_api_key: string | null;
  mem0_api_key: string | null;
  system_prompt: string;
  trigger_key: string;
  is_active_globally: number;
  cache_ttl_mins: number;
  trigger_length_threshold: number;
  frustration_keywords: string;
  mem0_top_k: number;
  mem0_threshold: number;
  mem0_rerank: number;
  mem0_latest_only: number;
  short_term_msg_limit: number;
  updated_at: string;
}

export interface ChatRecord {
  id: string;
  name: string;
  is_active: number;
  allow_mentions: number;
  custom_trigger: string | null;
  custom_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: number;
  chat_id: string;
  sender_id: string;
  sender_name: string | null;
  content: string;
  source: 'human' | 'bot';
  is_synced: number;
  timestamp: number;
}

export interface BotInvocationRecord {
  id: number;
  chat_id: string;
  sender_id: string;
  trigger_text: string;
  system_prompt: string;
  context_messages: string; // JSON string
  mem0_facts: string; // JSON string
  model_used: string;
  response_text: string;
  latency_ms: number;
  timestamp: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  public db!: DatabaseSync;

  // Cached prepared statements
  public stmts!: {
    getSettings: StatementSync;
    updateSettings: StatementSync;
    getChat: StatementSync;
    insertChat: StatementSync;
    updateChatName: StatementSync;
    getAllChats: StatementSync;
    setChatActive: StatementSync;
    setChatPrompt: StatementSync;
    setChatTrigger: StatementSync;
    setChatMentions: StatementSync;
    getUser: StatementSync;
    insertUser: StatementSync;
    updateUserName: StatementSync;
    insertMessage: StatementSync;
    getRecentMessages: StatementSync;
    getUnsyncedMessages: StatementSync;
    markMessagesSynced: StatementSync;
    insertInvocation: StatementSync;
    getInvocations: StatementSync;
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
    // We drop old tables for a clean MVP upgrade to the new schema
    this.db.exec(`
      DROP TABLE IF EXISTS bot_config;
      DROP TABLE IF EXISTS groups;
      DROP TABLE IF EXISTS messages;
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        llm_api_key TEXT,
        mem0_api_key TEXT,
        system_prompt TEXT NOT NULL,
        trigger_key TEXT NOT NULL,
        is_active_globally INTEGER DEFAULT 1,
        cache_ttl_mins INTEGER DEFAULT 60,
        trigger_length_threshold INTEGER DEFAULT 80,
        frustration_keywords TEXT DEFAULT 'wrong,forget,bad,stupid,old context,ignore,update,actually,fuck you,wtf,remember,don''t you,dont you,what,idiot,incorrect,not true,false,lies,mistake,changed,recall,remind,earlier,before,previously,did i tell,do you know,who said,refresh,new info',
        mem0_top_k INTEGER DEFAULT 10,
        mem0_threshold REAL DEFAULT 0.3,
        mem0_rerank INTEGER DEFAULT 0,
        mem0_latest_only INTEGER DEFAULT 1,
        short_term_msg_limit INTEGER DEFAULT 50,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try { this.db.exec("ALTER TABLE settings ADD COLUMN mem0_top_k INTEGER DEFAULT 10;"); } catch (e) {}
    try { this.db.exec("ALTER TABLE settings ADD COLUMN mem0_threshold REAL DEFAULT 0.3;"); } catch (e) {}
    try { this.db.exec("ALTER TABLE settings ADD COLUMN mem0_rerank INTEGER DEFAULT 0;"); } catch (e) {}
    try { this.db.exec("ALTER TABLE settings ADD COLUMN mem0_latest_only INTEGER DEFAULT 1;"); } catch (e) {}
    try { this.db.exec("ALTER TABLE settings ADD COLUMN short_term_msg_limit INTEGER DEFAULT 50;"); } catch (e) {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_active INTEGER DEFAULT 0,
        allow_mentions INTEGER DEFAULT 1,
        custom_trigger TEXT,
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
        chat_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT,
        content TEXT NOT NULL,
        source TEXT DEFAULT 'human',
        is_synced INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bot_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        context_messages TEXT,
        mem0_facts TEXT,
        model_used TEXT NOT NULL,
        response_text TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages (chat_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_unsynced ON messages (is_synced);
    `);

    const defaultPrompt =
      this.configService.get<string>("defaultSystemPrompt") ||
      "You are a helpful chat assistant.";
    const defaultTrigger = this.configService.get<string>("defaultTriggerKey") || "!bot";
    const expandedKeywords =
      "wrong,forget,bad,stupid,old context,ignore,update,actually,fuck you,wtf,remember,don't you,dont you,what,idiot,incorrect,not true,false,lies,mistake,changed,recall,remind,earlier,before,previously,did i tell,do you know,who said,refresh,new info";

    const checkConfig = this.db.prepare("SELECT * FROM settings WHERE id = 1");
    const config = checkConfig.get() as any;
    if (!config) {
      const insertConfig = this.db.prepare(
        "INSERT INTO settings (id, system_prompt, trigger_key, is_active_globally, frustration_keywords) VALUES (1, ?, ?, 1, ?)",
      );
      insertConfig.run(defaultPrompt, defaultTrigger, expandedKeywords);
    } else if (
      !config.frustration_keywords ||
      config.frustration_keywords === "wrong,forget,bad,stupid,old context,ignore,update,actually"
    ) {
      this.db
        .prepare("UPDATE settings SET frustration_keywords = ? WHERE id = 1")
        .run(expandedKeywords);
    }
  }

  private prepareStatements() {
    this.stmts = {
      getSettings: this.db.prepare("SELECT * FROM settings WHERE id = 1"),
      updateSettings: this.db.prepare(
        "UPDATE settings SET llm_api_key = ?, mem0_api_key = ?, system_prompt = ?, trigger_key = ?, is_active_globally = ?, cache_ttl_mins = ?, trigger_length_threshold = ?, frustration_keywords = ?, mem0_top_k = ?, mem0_threshold = ?, mem0_rerank = ?, mem0_latest_only = ?, short_term_msg_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ),
      getChat: this.db.prepare("SELECT * FROM chats WHERE id = ?"),
      insertChat: this.db.prepare("INSERT INTO chats (id, name, is_active, allow_mentions) VALUES (?, ?, 0, 1)"),
      updateChatName: this.db.prepare(
        "UPDATE chats SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      getAllChats: this.db.prepare("SELECT * FROM chats ORDER BY updated_at DESC"),
      setChatActive: this.db.prepare(
        "UPDATE chats SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      setChatPrompt: this.db.prepare(
        "UPDATE chats SET custom_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      setChatTrigger: this.db.prepare(
        "UPDATE chats SET custom_trigger = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      setChatMentions: this.db.prepare(
        "UPDATE chats SET allow_mentions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      getUser: this.db.prepare("SELECT * FROM users WHERE id = ?"),
      insertUser: this.db.prepare("INSERT INTO users (id, name) VALUES (?, ?)"),
      updateUserName: this.db.prepare(
        "UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ),
      insertMessage: this.db.prepare(
        "INSERT INTO messages (chat_id, sender_id, sender_name, content, source, is_synced, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ),
      getRecentMessages: this.db.prepare(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ?",
      ),
      getUnsyncedMessages: this.db.prepare(
        "SELECT * FROM messages WHERE chat_id = ? AND is_synced = 0 ORDER BY timestamp ASC",
      ),
      markMessagesSynced: this.db.prepare(
        "UPDATE messages SET is_synced = 1 WHERE chat_id = ? AND is_synced = 0",
      ),
      insertInvocation: this.db.prepare(
        "INSERT INTO bot_invocations (chat_id, sender_id, trigger_text, system_prompt, context_messages, mem0_facts, model_used, response_text, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ),
      getInvocations: this.db.prepare(
        "SELECT * FROM bot_invocations ORDER BY timestamp DESC LIMIT ?",
      ),
    };
  }

  getSettings(): SettingsRecord {
    return this.stmts.getSettings.get() as unknown as SettingsRecord;
  }

  saveMessage(msg: Partial<MessageRecord>): MessageRecord {
    const result = this.stmts.insertMessage.run(
      msg.chat_id,
      msg.sender_id,
      msg.sender_name || null,
      msg.content,
      msg.source || 'human',
      msg.is_synced || 0,
      msg.timestamp || Date.now(),
    );
    return { ...msg, id: Number(result.lastInsertRowid) } as MessageRecord;
  }

  getRecentMessages(chatId: string, limit = 50): MessageRecord[] {
    return this.stmts.getRecentMessages.all(chatId, limit) as unknown as MessageRecord[];
  }

  updateSettings(settings: Partial<SettingsRecord>) {
    const current = this.getSettings();
    this.stmts.updateSettings.run(
      settings.llm_api_key !== undefined ? settings.llm_api_key : current.llm_api_key,
      settings.mem0_api_key !== undefined ? settings.mem0_api_key : current.mem0_api_key,
      settings.system_prompt !== undefined ? settings.system_prompt : current.system_prompt,
      settings.trigger_key !== undefined ? settings.trigger_key : current.trigger_key,
      settings.is_active_globally !== undefined ? settings.is_active_globally : current.is_active_globally,
      settings.cache_ttl_mins !== undefined ? settings.cache_ttl_mins : current.cache_ttl_mins,
      settings.trigger_length_threshold !== undefined ? settings.trigger_length_threshold : current.trigger_length_threshold,
      settings.frustration_keywords !== undefined ? settings.frustration_keywords : current.frustration_keywords,
      settings.mem0_top_k !== undefined ? settings.mem0_top_k : current.mem0_top_k,
      settings.mem0_threshold !== undefined ? settings.mem0_threshold : current.mem0_threshold,
      settings.mem0_rerank !== undefined ? settings.mem0_rerank : current.mem0_rerank,
      settings.mem0_latest_only !== undefined ? settings.mem0_latest_only : current.mem0_latest_only,
      settings.short_term_msg_limit !== undefined ? settings.short_term_msg_limit : current.short_term_msg_limit,
    );
  }

  upsertChat(id: string, name?: string) {
    const existing = this.stmts.getChat.get(id) as unknown as ChatRecord | undefined;
    if (!existing) {
      this.stmts.insertChat.run(id, name || id);
    } else if (name && existing.name !== name && name !== id) {
      this.stmts.updateChatName.run(name, id);
    }
  }

  getChat(id: string): ChatRecord | undefined {
    return this.stmts.getChat.get(id) as unknown as ChatRecord | undefined;
  }

  getAllChats(): ChatRecord[] {
    return this.stmts.getAllChats.all() as unknown as ChatRecord[];
  }

  setChatActive(id: string, isActive: boolean) {
    this.stmts.setChatActive.run(isActive ? 1 : 0, id);
  }

  setChatPrompt(id: string, customPrompt: string | null) {
    this.stmts.setChatPrompt.run(customPrompt, id);
  }

  setChatTrigger(id: string, customTrigger: string | null) {
    this.stmts.setChatTrigger.run(customTrigger, id);
  }

  setChatMentions(id: string, allowMentions: boolean) {
    this.stmts.setChatMentions.run(allowMentions ? 1 : 0, id);
  }

  getUnsyncedMessages(chatId: string): MessageRecord[] {
    return this.stmts.getUnsyncedMessages.all(chatId) as unknown as MessageRecord[];
  }

  markMessagesSynced(chatId: string) {
    this.stmts.markMessagesSynced.run(chatId);
  }

  saveInvocation(record: Omit<BotInvocationRecord, "id" | "timestamp">): BotInvocationRecord {
    const res = this.stmts.insertInvocation.run(
      record.chat_id,
      record.sender_id,
      record.trigger_text,
      record.system_prompt,
      record.context_messages,
      record.mem0_facts,
      record.model_used,
      record.response_text,
      record.latency_ms,
    );
    return { ...record, id: Number(res.lastInsertRowid), timestamp: new Date().toISOString() };
  }

  upsertUser(id: string, name?: string) {
    const existing = this.stmts.getUser.get(id) as unknown as { id: string; name: string } | undefined;
    if (!existing) {
      this.stmts.insertUser.run(id, name || id);
    } else if (name && existing.name !== name) {
      this.stmts.updateUserName.run(name, id);
    }
  }

  getUserName(id: string): string | null {
    const user = this.stmts.getUser.get(id) as unknown as { id: string; name: string } | undefined;
    return user?.name || null;
  }

  getInvocations(limit = 100): BotInvocationRecord[] {
    return this.stmts.getInvocations.all(limit) as unknown as BotInvocationRecord[];
  }
}
