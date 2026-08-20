## Context

The current bot hardcodes configs, limits Mem0 memory to simple string injection, and suffers from potential privacy leakage across groups because Mem0 memories are queried globally by user ID rather than isolated per group. Furthermore, to save Mem0 limits, we need a strategy to batch uploads and cache retrievals.

## Goals / Non-Goals

**Goals:**
- Separate configurations into a manageable UI and DB table.
- Implement strict memory isolation per WhatsApp chat.
- Enable LLM semantic retrieval across both group context and personal context in a single Mem0 API call using formatted text injection and vector search.
- Dramatically reduce Mem0 API requests using bulk-upload and smart SQLite caching.
- Capture full LLM and contextual state in an observability table for debugging.

**Non-Goals:**
- Supporting platforms other than WhatsApp.
- Replacing Mem0 entirely with a local vector DB (we still use Mem0, just smarter).

## Decisions

**1. Config and Observability Storage: SQLite**
- **Decision:** Use SQLite `Settings` and `BotInvocations` tables.
- **Rationale:** We already use SQLite for short-term message storage via `DatabaseModule`. Extending this is zero-dependency, ultra-fast, and synchronous.

**2. Strict Privacy Silos via Combined IDs**
- **Decision:** When sending data to Mem0, `run_id` is the `group_id`, and `user_id` is a composite key: `{sender_jid}_{group_id}`.
- **Rationale:** This physically prevents Mem0 from ever returning a secret Bob told in the "Family" group when Bob is chatting in the "Tech" group, even if Bob's `user_id` is explicitly queried.

**3. Vector Search Context Injection**
- **Decision:** Before storing to SQLite/Mem0, resolve mentions (e.g. `@12345`) to `@Name`. When saving to Mem0, prepend the sender's display name (`Bob said: ...`).
- **Rationale:** Mem0's semantic search will match the trigger text (e.g. "What does Bob like?") against the "Bob said:" text natively. This removes the need for complex metadata filtering and guarantees that both the subject and the speaker's facts are found in a single API call (filtered strictly by `run_id: group_id`).

**4. Batch-Upload and Smart Caching**
- **Decision:** Messages are ONLY saved to Mem0 when a trigger happens. Before retrieval, all un-synced messages are batched by `user_id` and uploaded.
- **Decision:** Mem0 retrieval is cached locally in SQLite for 60 minutes. The cache is BUSTED if: message length > 80, contains frustration keywords (e.g., "wrong", "update"), or explicitly tags a user in `mentionedJid`.
- **Rationale:** Safely protects the 1,000 Mem0 free-tier limits without sacrificing responsiveness when complex context is needed.

**5. Multi-Page React Admin UI**
- **Decision:** Upgrade the Vite+React dashboard to a multi-page app using React Router.
- **Rationale:** The single page is too cluttered to hold global configs, group settings, and an observability table.

## Risks / Trade-offs

- **Risk:** High latency during cache-bust triggers (due to batch Mem0 upload + Mem0 retrieval + LLM generation).
  - **Mitigation:** Execute the batch Mem0 uploads concurrently (`Promise.all`) before the search.
- **Risk:** Resolving JIDs to names for mentions might fail if the user hasn't spoken recently.
  - **Mitigation:** Fallback to formatting as `@User_{JID}` if the local SQLite doesn't have their name cached.
