## ADDED Requirements

### Requirement: Strict Privacy Silos
The system SHALL combine the sender's JID and group ID to form the `user_id`, and use the group ID as the `run_id` for Mem0 operations.

#### Scenario: Ensuring cross-group privacy
- **WHEN** Bob triggers the bot in the "Tech" group
- **THEN** Mem0 is queried using strictly `run_id: tech_group_id`, preventing facts from Bob's "Family" group from leaking.

### Requirement: Semantic Name Injection
The system SHALL prefix the user's resolved display name to their message text before storing or searching Mem0.

#### Scenario: Matching a person's facts
- **WHEN** a user triggers the bot by asking "What does Bob like?"
- **THEN** Mem0's semantic search uses the trigger text to natively match against memories formatted as "Bob said: I like pizza".

### Requirement: Batch Uploading Unsynced Messages
The system SHALL store messages locally in SQLite and only batch upload them to Mem0 when a bot trigger occurs.

#### Scenario: Triggering the bot after 10 messages
- **WHEN** the bot is triggered after 10 organic messages were sent
- **THEN** the system uploads the 10 messages in concurrent batches grouped by `user_id` before retrieving context.

### Requirement: Smart Cache Invalidation
The system SHALL cache Mem0 retrieval results locally and bypass the cache based on configurable rules.

#### Scenario: Bypassing the cache on a long prompt
- **WHEN** a user sends a trigger message longer than the configured character threshold
- **THEN** the system bypasses the SQLite cache and fetches fresh context from Mem0.

#### Scenario: Bypassing the cache on frustration keywords
- **WHEN** a user sends a trigger message containing a word like "wrong" or "forget"
- **THEN** the system bypasses the SQLite cache and fetches fresh context from Mem0.
