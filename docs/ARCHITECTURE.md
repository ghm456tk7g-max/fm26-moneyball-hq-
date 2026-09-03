# Architecture

## Decision
Use a self-contained Windows desktop architecture. Development tooling may use web technologies, but production must package every required runtime with the application.

## Layers

### Desktop shell
Responsible for the native window, lifecycle, file picker, local paths, updates/build metadata and application startup.

### UI
Recruitment dashboard, imports, player explorer, comparisons, squad needs and transfer decisions.

### Domain engine
Pure deterministic logic for parsing normalized player records, scoring, role fit, confidence and transfer recommendations. Domain logic must not depend on UI state.

### Persistence
Local SQLite database stored in the user's application-data directory, not beside the executable. Schema migrations are mandatory.

### Import pipeline
Raw file -> detect encoding/delimiter -> parse -> map aliases -> validate -> normalize -> preview -> commit import.

## Packaging requirements
- Windows x64 release
- installer creates Start Menu entry and optional/default desktop shortcut
- no manually started local server
- no Python/Node/npm/Visual Studio requirement for end user
- writable data lives outside Program Files
- uninstalling must not unexpectedly destroy user saves/backups

## Testing strategy
- unit tests for parsers and scoring
- golden-file import tests
- financial boundary tests
- database migration tests
- Windows packaging smoke test
- clean-machine launch test before release

## Red-team invariants
- Unknown/missing values are never silently interpreted as bad performance.
- A high Moneyball score cannot hide low confidence.
- Role-fit scoring is configuration-driven.
- Financial affordability and player quality remain separate concepts.
- Raw imported data is retained for audit/debugging.
