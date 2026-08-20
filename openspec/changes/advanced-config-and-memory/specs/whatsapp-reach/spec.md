## ADDED Requirements

### Requirement: @Mention Triggering
The system SHALL trigger the bot if the bot's own JID is present in the `mentionedJid` array of an incoming message.

#### Scenario: Tagging the bot
- **WHEN** a user sends a message containing `@<bot_number>`
- **THEN** the bot intercepts the trigger, resolves context, and replies.

### Requirement: Mention Name Resolution
The system SHALL replace raw JIDs in the text with the user's cached display name before saving to Mem0 or supplying short-term LLM context.

#### Scenario: Resolving a tagged user
- **WHEN** a message contains text "I agree with @123456"
- **THEN** the system swaps it to "I agree with @Alice" based on the SQLite sender cache.

### Requirement: Self-Message and Source Tracking
The system SHALL process self-sent messages and distinguish between human-typed messages and LLM-generated messages in the database.

#### Scenario: Human sending a message from the host account
- **WHEN** the host account sends a message manually
- **THEN** the system logs it to SQLite with `source: 'human'`.

#### Scenario: LLM generating a reply from the host account
- **WHEN** the LLM generates a response
- **THEN** the system logs it to SQLite with `source: 'bot'`.

### Requirement: 1-on-1 DM Support
The system SHALL allow processing triggers and generating replies in direct (non-group) messages if enabled per-chat.

#### Scenario: Messaging the bot in a DM
- **WHEN** a user DMs the bot with a trigger word
- **THEN** the bot replies using the DM chat ID as the isolated `run_id`.
