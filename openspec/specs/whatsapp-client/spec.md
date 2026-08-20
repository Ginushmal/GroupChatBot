# Purpose
TBD

## Requirements

### Requirement: Connect via Personal Account

The system SHALL connect to WhatsApp using the Baileys library and authenticate via QR code as a personal device.

#### Scenario: Successful connection

- **WHEN** the system starts without existing credentials
- **THEN** it logs a QR code to the terminal for the user to scan.
- **WHEN** the user scans the QR code
- **THEN** the system successfully connects and saves credentials.

### Requirement: Listen to incoming group messages

The system SHALL receive incoming messages from WhatsApp groups and parse the sender ID, group ID, and message text.

#### Scenario: Message received

- **WHEN** a message is received in a group
- **THEN** the system extracts the text, group ID, and sender ID and forwards it to the orchestrator.

