## Why

The current GroupChatBot MVP relies on hardcoded configurations, lacks visibility into the LLM's decision-making process (observability), and uses a naive Mem0 strategy that wastes API limits and risks leaking private conversational context across different groups. This change upgrades the bot to be fully observable, easily configurable via a multi-page Admin UI, and introduces a highly optimized, privacy-safe memory architecture.

## What Changes

- Add a dynamic `Settings` SQLite table to manage LLM keys, Mem0 keys, and System Prompts without code changes.
- Split the Admin UI into multiple pages: Dashboard (Groups/QR), Config, and Observability Logs.
- Add an observability table (`BotInvocations`) that logs exact system prompts, injected facts, model used, and latency for every generated reply.
- Capture and display real WhatsApp group names (subjects) in the UI instead of raw JIDs.
- Support WhatsApp `@mentions`, 1-on-1 direct messages, and self-sent messages (explicitly distinguishing human vs bot source in the database).
- Prepend WhatsApp display names to messages sent to Mem0 and the LLM (e.g. `Bob said: ...`) to enable native semantic mapping.
- Implement strict privacy silos in Mem0 using combined IDs (`user_id: {sender_jid}_{group_id}` and `run_id: {group_id}`).
- Drastically reduce Mem0 API usage via batch-uploading un-synced messages on trigger, and heavily caching Mem0 retrievals locally.
- Implement a Smart Cache Invalidation strategy based on TTL, trigger message length, frustration keywords, and explicit mentions.

## Capabilities

### New Capabilities
- `admin-dashboard`: Multi-page React UI and NestJS API endpoints for managing dynamic configuration and viewing rich observability logs.
- `advanced-memory`: High-efficiency, privacy-safe Mem0 architecture featuring batch uploads, name-injected semantic retrieval, strict group silos, and smart SQLite caching.
- `whatsapp-reach`: Expanded Baileys integration supporting `@mentions`, 1-on-1 DMs, and self-sent message handling (Human vs LLM source tracking).

### Modified Capabilities

## Impact

- **Database**: Adds `Settings` and `BotInvocations` tables. Modifies `Messages` table to track source (`bot` vs `human`) and sender names.
- **WhatsApp Service**: Message filtering rules will be updated to allow DMs and self-messages. Mentions parsing will be added. Name resolution before storage will be implemented.
- **Memory Service**: The Mem0 integration will be completely overhauled from single-message adds to grouped batch-adds. Retrieval will include SQLite caching and smart-invalidation logic.
- **Admin UI**: The single-page dashboard will be refactored into a React Router multi-page application.
