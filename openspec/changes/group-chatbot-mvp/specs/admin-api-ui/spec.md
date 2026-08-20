## ADDED Requirements

### Requirement: Configure bot settings

The system SHALL provide an API and a Vite-based UI to configure the system prompt, active groups, and trigger keys.

#### Scenario: Settings updated

- **WHEN** an admin updates the trigger key via the UI
- **THEN** the API saves the new configuration to the database and the orchestrator immediately respects the new trigger key.
