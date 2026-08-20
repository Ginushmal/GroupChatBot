## Why

Currently, there is no system to provide an omnipresent, continuous-memory AI participant for group chats (specifically WhatsApp, using personal accounts) that remembers people and group dynamics. This change introduces the foundational MVP to solve this by providing a lightweight, deployable service orchestrating LLM interactions and memory retention via Mem0 and SQLite.

## What Changes

- Initialize a Vite+ monorepo (`bot-service` and `admin-ui`).
- Implement WhatsApp integration using `Baileys` for personal accounts.
- Implement short-term memory management using local SQLite (last 50 messages context).
- Implement long-term entity/fact memory management using Mem0 (cloud free tier).
- Integrate the `Manifest` router for unified LLM API access.
- Build a NestJS orchestrator backend (`bot-service`).
- Build a Vite frontend for configuration (`admin-ui`).
- Create a `docker-compose.yml` for easy deployment on a 1GB RAM Google VM.

## Capabilities

### New Capabilities

- `whatsapp-client`: Connects to WhatsApp using personal account (Baileys) and listens to messages.
- `chat-orchestrator`: Core NestJS service handling triggers and dispatching to LLM/Memory.
- `memory-manager`: Abstraction combining SQLite (short-term) and Mem0 (long-term facts).
- `llm-router`: Integration with Manifest router for inference.
- `admin-api-ui`: Interface and API to manage system prompts, active groups, and triggers.

### Modified Capabilities

## Impact

- Creates the initial monorepo structure.
- Requires deployment environment with at least 1GB RAM and swap space.
- Establishes the foundational DB schema for User and Group normalization.
