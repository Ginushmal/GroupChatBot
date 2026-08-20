export interface AppConfig {
  port: number;
  sqliteDbPath: string;
  baileysAuthDir: string;
  manifestApiKey: string;
  manifestBaseUrl: string;
  manifestModel: string;
  mem0ApiKey: string;
  defaultTriggerKey: string;
  defaultSystemPrompt: string;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || "3000", 10),
  sqliteDbPath: process.env.SQLITE_DB_PATH || "./data/chatbot.db",
  baileysAuthDir: process.env.BAILEYS_AUTH_DIR || "./data/baileys_auth",
  manifestApiKey: process.env.MANIFEST_API_KEY || "",
  manifestBaseUrl: process.env.MANIFEST_BASE_URL || "https://api.manifest.build/v1",
  manifestModel: process.env.MANIFEST_MODEL || "auto",
  mem0ApiKey: process.env.MEM0_API_KEY || "",
  defaultTriggerKey: process.env.DEFAULT_TRIGGER_KEY || "!bot",
  defaultSystemPrompt:
    process.env.DEFAULT_SYSTEM_PROMPT ||
    "You are an intelligent, helpful, and witty group chat participant. Keep your responses concise, conversational, and context-aware.",
});
