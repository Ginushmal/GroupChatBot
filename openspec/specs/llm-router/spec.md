# Purpose
TBD

## Requirements

### Requirement: Route requests via Manifest

The system SHALL send all inference requests through the Manifest router, authenticating via the `MANIFEST_API_KEY` environment variable.

#### Scenario: Inference requested

- **WHEN** the orchestrator needs a reply
- **THEN** the request is formatted and sent to the Manifest endpoint, and the response is returned to the orchestrator.

