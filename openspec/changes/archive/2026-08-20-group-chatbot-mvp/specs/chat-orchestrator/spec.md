## ADDED Requirements

### Requirement: Filter messages by trigger

The system SHALL only process messages that contain the configured trigger key or mention the bot.

#### Scenario: Trigger matched

- **WHEN** a message contains the exact trigger key (e.g., "!bot")
- **THEN** the orchestrator initiates the memory retrieval and LLM inference flow.

### Requirement: Coordinate memory and LLM

The system SHALL fetch recent context and user/group facts before calling the LLM.

#### Scenario: Fetching context

- **WHEN** a valid triggered message is received
- **THEN** the orchestrator fetches the last 50 messages from SQLite and relevant facts from Mem0, and formats them into the LLM prompt.
