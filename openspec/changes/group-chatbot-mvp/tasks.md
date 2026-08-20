## 1. Monorepo Setup

- [x] 1.1 Scaffold Vite+ monorepo in the root directory.
- [x] 1.2 Scaffold NestJS `bot-service` inside the monorepo.
- [x] 1.3 Scaffold Vue/React Vite `admin-ui` inside the monorepo.

## 2. Infrastructure & Tooling

- [x] 2.1 Create `docker-compose.yml` defining the Node service and SQLite volume.
- [x] 2.2 Finalize Vite+ workspace configuration.

## 3. Bot Service: Core & WhatsApp

- [x] 3.1 Install Baileys and required dependencies in `bot-service`.
- [x] 3.2 Implement WhatsApp authentication and QR code logging.
- [x] 3.3 Implement message listener to intercept and parse group messages.

## 4. Bot Service: Memory & DB

- [x] 4.1 Set up SQLite database connection and initialize schema (Users, Groups, Config, Messages).
- [x] 4.2 Implement short-term context logging and retrieval (last 50 messages).
- [x] 4.3 Integrate Mem0 SDK (authenticating via `MEM0_API_KEY`).

## 5. Bot Service: LLM & Orchestration

- [x] 5.1 Integrate Manifest router for LLM inference calls (authenticating via `MANIFEST_API_KEY`).
- [x] 5.2 Implement message trigger filtering (e.g., respond only to '!bot' or mentions).
- [x] 5.3 Build the main coordination pipeline: Trigger -> Fetch Context/Facts -> LLM -> Reply.

## 6. Admin API & UI

- [x] 6.1 Expose NestJS endpoints to update system prompt, trigger keys, and active groups.
- [x] 6.2 Build Vite UI to manage configuration.
- [x] 6.3 Connect the UI to the API.
