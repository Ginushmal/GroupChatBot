## ADDED Requirements

### Requirement: Store short-term context

The system SHALL store all incoming messages in a local SQLite database, associated with their group ID.

#### Scenario: Message logged

- **WHEN** a message is received
- **THEN** it is immediately saved to the SQLite database with a timestamp.

### Requirement: Retrieve short-term context

The system SHALL retrieve the last 50 messages for a given group ordered by time.

#### Scenario: Context requested

- **WHEN** the orchestrator requests recent context for group X
- **THEN** the memory manager returns the 50 most recent messages for group X.

### Requirement: Fact extraction and storage

The system SHALL use Mem0 to store and retrieve long-term facts about users and groups, authenticating via the `MEM0_API_KEY` environment variable.

#### Scenario: Fact retrieved

- **WHEN** the orchestrator requests facts for user Y and group X
- **THEN** the memory manager queries Mem0 and returns relevant persistent facts.
