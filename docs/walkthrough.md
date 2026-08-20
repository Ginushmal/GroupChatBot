# GroupChatBot MVP - Final Implementation Walkthrough

Welcome to the definitive architecture and implementation guide for the **GroupChatBot MVP**. This document provides a complete technical walkthrough of the final implementation, explaining the data flow, memory management, modular design, and API integrations.

---

## 1. High-Level Architecture Overview

The system is built as a **Vite+ Monorepo** containing two primary applications:
- **`apps/bot-service`**: A robust Node.js backend built with the **NestJS** framework.
- **`apps/admin-ui`**: A lightweight frontend Single Page Application (SPA) built with React and Vite.

```mermaid
flowchart TD
    subgraph External APIs
        WA[WhatsApp Servers]
        MF[Manifest LLM Router]
        M0[Mem0 Cloud]
    end

    subgraph Bot Service (NestJS)
        WS[WhatsApp Client\nBaileys v7]
        ORC[Orchestrator\nService]
        LLM[LLM Service\nOpenAI SDK]
        MEM[Memory Service]
        DB[(node:sqlite\nLocal DB)]
        API[Admin API\nControllers]
    end

    subgraph Admin UI (Vite SPA)
        UI[Dashboard UI\nReact]
    end

    WA <==> |WebSocket| WS
    WS <--> |Extracted Msgs| ORC
    ORC <--> |Context & Facts| MEM
    ORC <--> |Prompt generation| LLM
    MEM <--> |Short-term| DB
    MEM <--> |Long-term| M0
    LLM <--> |Routed inference| MF
    API <--> |DB/WhatsApp State| DB
    UI <--> |HTTP/JSON Polling| API
```

---

## 2. Extendible Modular Design

The NestJS backend is architected using **Dependency Injection** (DI) to strictly separate concerns, making it highly modular and easily extendible. If you decide to swap WhatsApp for Discord, or SQLite for PostgreSQL, you only need to touch a single isolated module.

*   **`WhatsAppModule`**: Handles the raw Baileys v7 socket connection, QR code generation, event listening, and error recovery (like the 406 Not Acceptable bug).
*   **`LlmModule`**: Manages the OpenAI SDK instance connected to the Manifest router. It knows nothing about WhatsApp.
*   **`MemoryModule`**: Manages hybrid memory logic (SQLite for short-term, Mem0 for long-term facts).
*   **`DatabaseModule`**: Wraps the native `node:sqlite` connection, pre-compiles and caches SQL statements for ultra-fast synchronous execution.
*   **`OrchestratorModule`**: The "brain" that glues everything together. It injects all the services above, evaluates incoming messages against bot triggers, requests LLM generations, and triggers outbound replies.

---

## 3. The Orchestrator Logic & Data Flow

When a message arrives in a WhatsApp group, the following precise sequence of events occurs:

```text
[WhatsApp Server] 
      │ (1) messages.upsert (Encrypted binary payload)
      ▼
[WhatsAppService]
      │ Decrypts message
      │ Ignores empty, DM, or self-sent messages
      │ Extracts senderName, senderId, and text payload
      ▼
[OrchestratorService]
      │ (2) Checks database: Is bot active globally and for this group?
      │ (3) Checks for trigger ('!bot' or '@bot')
      ├──────────────────┐
      │ MATCH            │ NO MATCH
      ▼                  ▼
[Save Trigger Msg] [Save Normal Msg] (To SQLite)
      │                  │ 
      │                  └─▶ If msg > 20 chars, async send to Mem0 to extract facts.
      │
      ▼ (4) Compile Context
[MemoryService]
      │ ├─▶ Fetches last 50 messages from SQLite (Short-term)
      │ └─▶ Fetches user/group facts from Mem0 (Long-term)
      ▼
[LlmService]
      │ (5) Assembles System Prompt:
      │     - Global instructions
      │     - Group-specific instructions
      │     - Injected Mem0 Facts
      │     - Formatted 50-message chat history
      │ Sends to Manifest Router (Model: "auto")
      ▼
[WhatsAppService]
      │ (6) Send Response
      │ Tries to send encrypted payload to group.
      │ 
      │ ⚠️ IF 406 NOT-ACCEPTABLE (Session sync issue):
      │    -> Forces `sock.groupMetadata()` to fetch participant keys.
      │    -> Waits 5s/10s, then Retries.
      ▼
[WhatsApp Server] -> Delivered to Group!
```

---

## 4. Hybrid Memory Management

To maintain conversational coherence while keeping latency low and costs down, the bot utilizes a dual-layer memory system.

### Short-Term Context (`node:sqlite`)
*   **Storage**: Fast, local, embedded SQLite database (`chatbot.db`) running in Write-Ahead Log (WAL) mode.
*   **Performance**: The `DatabaseService` pre-compiles all SQL statements (`db.prepare()`) into a cached dictionary during server boot. It executes them synchronously, avoiding parsing overhead on the hot path.
*   **Usage**: Every single message sent in an active group is logged. When the bot is triggered, it extracts the last 50 messages, reverses them into chronological order, and feeds them to the LLM to provide immediate conversational context.

### Long-Term Facts (`Mem0 Cloud`)
*   **Storage**: Hosted Mem0 Cloud instance, accessed via native `fetch` REST calls.
*   **Ingestion Rules**: We don't want to pollute long-term memory with short commands (e.g., "!bot hi"). 
    *   **Organic Chat**: If a regular, non-trigger group message is sent and is **> 20 characters**, it is asynchronously uploaded to Mem0 to extract passive facts (e.g., "John likes hiking").
    *   **Direct Triggers**: If a user directly triggers the bot with a prompt **> 5 characters**, it is uploaded to Mem0 so the bot remembers direct instructions (e.g., "!bot my favorite color is blue").
    *   **Bot Replies**: Never sent to Mem0 to save API quota.
*   **Retrieval**: When the bot generates a reply, it queries Mem0 for `user_id` and `run_id` (group) facts, and injects them dynamically into the LLM system prompt.

---

## 5. LLM Router Integration (Manifest)

The bot abstracts away specific model dependencies by utilizing the **Manifest AI Router**. 
*   It uses the official `openai` NPM package, but points the `baseURL` to `https://api.manifest.build/v1`.
*   The model is set to `"auto"`. Manifest dynamically routes the prompt to the most efficient model (e.g., GPT-4o-mini, Claude 3.5 Haiku, etc.) based on real-time latency and cost metrics.
*   If the router experiences connection issues, the error is caught and safely sent back to the WhatsApp group, rather than crashing the NestJS application.

---

## 6. Admin UI Interaction

The React Vite application (`http://localhost:5173/`) acts as the control panel.
*   **Polling**: It polls `GET /api/status` every 4 seconds. When the bot starts up for the first time, Baileys emits a base64 QR code. The UI captures this and renders it on screen for the user to scan with their phone.
*   **Configuration**: The UI interacts with the NestJS controllers to toggle the bot on/off globally, change the global trigger word, and write custom system prompts that are instantly applied to the LLM's next generation.
*   **Group Toggles**: As Baileys automatically discovers groups, they appear in the UI. Users can toggle the bot's activity per group and view the real-time SQLite chat history directly in the browser via `GET /api/messages/:groupId`.
