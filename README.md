# FM26 MONEYBALL HQ

Private Windows desktop recruitment and transfer-intelligence application for Football Manager 26.

## Core workflow

FM export → validated import → conservative scoring → squad need → shortlist → transfer decision.

The application deliberately stays focused on recruitment. Match analysis, a manager chronicle, FMF parsing, external APIs and AI chat are outside its scope.

## Current capabilities

- Imports CSV, TSV and TXT exports in UTF-8, UTF-8 BOM, UTF-16 or Windows-1252.
- Detects comma, semicolon and tab delimiters and common German/English FM column names.
- Parses German/English decimals, K/M/B currency suffixes and uncertain value ranges conservatively.
- Reports missing columns, invalid values, skipped rows and merged duplicate players.
- Scores Performance, Value, Financial, Development, Role Fit, Confidence and Moneyball by relevant position group.
- Dampens percentiles from small comparison groups and treats missing values as unknown rather than zero performance.
- Applies explicit confidence gates below 450 minutes and below 900 minutes.
- Requires sufficient data quality before assigning Hidden Gem, Development or Budget Friendly tags.
- Stores targets, squad data, settings and shortlist state in a local SQLite database under Electron's per-user application-data directory.
- Preserves shortlist entries when the same player is reimported and uses transactional dataset replacement.
- Produces conservative BUY / CONSIDER / WATCH / PASS decisions. Unknown or breached financial constraints cannot produce BUY or CONSIDER.
- Compares a target's evidenced role profile with matching players in the imported squad.
- Creates integrity-checked SQLite backups and restores them only after confirmation and an automatic safety backup.

## Windows installation

GitHub Actions builds the NSIS installer named in the `FM26-MONEYBALL-HQ-Windows` artifact. Download the artifact from the latest successful **Windows Build** workflow run and start the contained `.exe`.

The installed application includes its runtime. The end user does not need Python, Node.js, npm, Visual Studio, .NET, a local server, PowerShell, CMD or a batch file. The installer creates Start Menu and Desktop shortcuts. App data remains in the user's application-data directory and is not deleted by the uninstaller.

## Development checks

Use Node.js 22 or 24:

```bash
npm ci
npm run build
```

`npm run build` runs the complete Node test suite, strict TypeScript checking and the production renderer build. On Windows, create the installer with:

```bash
npm run dist:win
```

The committed lockfile and `npm ci` keep local and CI dependency resolution reproducible.
