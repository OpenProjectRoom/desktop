# Feature 001: View notes

## User Scenarios & Testing

### User Story 1 - Inspect notes (Priority: P1)

As a developer trying OpenBuildRoom, I can open the notes API and see the same data listed in Data Sources.

**Acceptance Scenario:** Given the service is running, when I visit `/api/notes`, then I receive the notes from `data/notes.json`.

## Requirements

- **FR-001**: The service MUST return the current note records as JSON.
- **FR-002**: The service MUST expose a health endpoint for the workspace.

## Success Criteria

- **SC-001**: Both endpoints pass automated tests without external infrastructure.
