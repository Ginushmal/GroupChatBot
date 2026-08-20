## ADDED Requirements

### Requirement: Multi-page Admin App
The system SHALL expose a multi-page React application for administration.

#### Scenario: Navigating the dashboard
- **WHEN** the user visits the admin UI
- **THEN** they can navigate between Dashboard, Config, and Logs pages

### Requirement: Database Config Management
The system SHALL store and retrieve configuration (API keys, Prompts, Cache TTL) from a dynamic SQLite `Settings` table.

#### Scenario: Updating LLM Key
- **WHEN** the user updates the LLM API key in the Config page
- **THEN** the backend immediately uses the new key for the next generation without a restart

### Requirement: Dynamic Observability Logging
The system SHALL record every LLM invocation into a `BotInvocations` SQLite table.

#### Scenario: Viewing a log entry
- **WHEN** a user clicks on a log entry in the Logs page
- **THEN** the UI displays the exact system prompt, the 50-message context, the injected Mem0 facts, the model used, and the latency.
