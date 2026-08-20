## Context

We are building a lightweight AI participant for group chats (MVP on WhatsApp). The core constraints are the deployment target (Google Cloud `e2-micro` with 1GB RAM and a 4GB Swap file) and the need for both immediate context (last N messages) and long-term entity tracking (remembering facts about users and groups).

## Goals / Non-Goals

**Goals:**

- Connect to WhatsApp personal accounts via WebSockets (bypassing heavy browser orchestration).
- Provide a scalable memory abstraction separating "context window" from "learned facts".
- Expose a unified LLM inference interface.
- Deploy the entire system (backend and config UI) via a single `docker-compose.yml`.

**Non-Goals:**

- Enterprise multi-tenant SaaS capabilities (this is a personal/hobby deployment).
- Official WhatsApp Business API integration (using personal connection via Baileys).
- Self-hosting vector databases or graph databases (delegating to Mem0 cloud).

## Decisions

### 1. WhatsApp Connection: Baileys

- **Alternative:** `whatsapp-web.js` (Puppeteer).
- **Decision:** Use Baileys to connect via raw WebSockets.
- **Rationale:** The 1GB RAM constraint makes running headless Chrome impossible without constant swapping. Baileys is lightweight and fulfills the requirement for personal account usage.

### 2. Memory Tiering: SQLite + Mem0

- **Alternative:** LangChain/LlamaIndex local vector stores (Chroma, FAISS).
- **Decision:** Local SQLite for the last 50 messages + Mem0 Cloud Free Tier for entities/facts.
- **Rationale:** Vector databases are RAM-hungry. SQLite easily handles short-term context. Mem0 abstracts the complexity of fact extraction and RAG, and by using their cloud tier, we offload compute and memory requirements.
- **Note:** Mem0 cloud provisioning is handled externally by the user. The app will authenticate via the `MEM0_API_KEY` environment variable.

### 3. LLM Routing: Manifest

- **Alternative:** Custom API router or LiteLLM.
- **Decision:** Manifest (`manifest.build`).
- **Rationale:** Provides a simple, single API endpoint to configure fallbacks and swap models without redeploying the NestJS app.
- **Note:** Manifest setup is handled externally by the user. The app will authenticate via the `MANIFEST_API_KEY` environment variable.

### 4. Monorepo Toolchain: Vite+ (`vp`)

- **Alternative:** Nx, Turborepo, or raw npm workspaces.
- **Decision:** Vite+ (`vp`).
- **Rationale:** Unified, fast toolchain that natively handles formatting (Oxfmt), linting (Oxlint), testing (Vitest), and workspace management.

### 5. Deployment: Docker Compose

- **Decision:** A `docker-compose.yml` defining the Node environment and mounting a volume for the SQLite database.

## Risks / Trade-offs

- **Risk: WhatsApp Ban** → Personal accounts using automated bots risk bans if flagged for spam. Mitigation: Strict trigger-key usage (bot only replies when explicitly invoked or under specific conditions).
- **Risk: Swap Thrashing** → If the Node app grows too large, the OS will thrash the swap file, degrading performance. Mitigation: Keep the NestJS container lean, avoid loading large arrays into memory, stream responses where possible.
