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
Local SQLite database stored in Electron's per-user application-data directory, not beside the executable. Schema version 2 is tracked with `PRAGMA user_version` and a migration ledger. WAL, foreign keys, transactions, integrity checks and verified backups protect local state. Dataset replacement upserts stable player identities so a reimport does not discard matching shortlist records.

### Import pipeline
Raw file -> enforce size/type limits -> detect encoding/delimiter -> parse -> map aliases -> validate -> normalize -> deduplicate -> score -> transactional commit.

### Desktop security boundary
The renderer has no Node.js integration and runs with context isolation and Chromium sandboxing. A narrow preload bridge exposes only the required application operations. Main-process IPC validates dataset types, IDs, settings and file selections. Navigation, popup windows and renderer permission requests are denied.

## Packaging requirements
- Windows x64 release
- installer creates Start Menu entry and optional/default desktop shortcut
- no manually started local server
- no Python/Node/npm/Visual Studio requirement for end user
- writable data lives outside Program Files
- uninstalling must not unexpectedly destroy user saves/backups

## Testing strategy
- unit tests for parsers, position mapping, scoring and settings
- representative import tests for German/English formats and encodings
- financial boundary tests
- database migration, integrity, shortlist persistence and backup tests
- Windows packaging smoke test
- clean-machine launch test before release

## Red-team invariants
- Unknown/missing values are never silently interpreted as bad performance.
- A high Moneyball score cannot hide low confidence.
- Role-fit scoring is configuration-driven.
- Financial affordability and player quality remain separate concepts.
- Raw imported data is retained for audit/debugging.
