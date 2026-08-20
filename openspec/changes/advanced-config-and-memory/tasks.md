## 1. Database Schema Updates

- [x] 1.1 Create `Settings` table in `chatbot.db` to store API keys, system prompts, cache TTL, and length thresholds.
- [x] 1.2 Create `BotInvocations` table to log full observability data (system prompt, retrieved context, model, latency).
- [x] 1.3 Alter `Messages` table to include `source` (bot/human) and `sender_name`.
- [x] 1.4 Alter `Groups` table to rename to `Chats` (supporting 1-on-1s) and add `allow_mentions`, `trigger_word` columns.

## 2. WhatsApp Reach & Mention Processing

- [x] 2.1 Update `WhatsAppService` to allow non-group chats (DMs) if configured in the DB.
- [x] 2.2 Update `WhatsAppService` to process self-sent messages (flagging manual types as `human` and LLM replies as `bot`).
- [x] 2.3 Implement trigger interception for `@mentions` checking `mentionedJid` against `sock.user.id`.
- [x] 2.4 Implement Mention Name Resolution: swap raw JIDs in incoming text with cached display names from the SQLite `Messages` table.

## 3. Advanced Memory & Caching

- [x] 3.1 Update `MemoryService` `add()` logic to accept batch uploads.
- [x] 3.2 Update `Orchestrator` to batch all unsynced SQLite messages (grouped by `user_id: {sender}_{group}`) and upload to Mem0 concurrently before a trigger.
- [x] 3.3 Implement Smart Cache invalidation logic: evaluate TTL, trigger length, frustration keywords regex, and mention arrays.
- [x] 3.4 Update `MemoryService` `search()` to format the query text (`Name said: ...`) and filter strictly by `run_id: group_id`.
- [x] 3.5 Inject retrieved Mem0 context into the LLM system prompt.

## 4. Observability & Orchestrator

- [x] 4.1 Update `OrchestratorService` to record execution latency.
- [x] 4.2 Save full LLM context, trigger text, and latency to the `BotInvocations` table after every successful response.
- [x] 4.3 Dynamically load LLM API keys and Prompts from the `Settings` table instead of hardcoded/env.

## 5. Admin UI Multi-Page Refactor

- [x] 5.1 Refactor React frontend to use React Router with 3 pages: Dashboard, Config, Logs.
- [x] 5.2 Build Config page with forms to update API keys, prompts, and cache thresholds via API.
- [x] 5.3 Build Logs page with a data table querying the `BotInvocations` endpoint, including an expandable accordion for full context.
- [x] 5.4 Update Group/Chat list to display the actual chat `subject` from WhatsApp metadata instead of JID.
- [x] 5.5 Add a Logout button in the UI that hits a backend endpoint to delete the Baileys session and restart auth.
