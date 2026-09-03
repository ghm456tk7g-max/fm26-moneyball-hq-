# FM26 MONEYBALL HQ

Private Windows desktop recruitment and transfer-intelligence application for Football Manager 26.

## What the current MVP does

- Imports FM player exports from CSV, TSV and TXT.
- Recognizes common German and English column names automatically.
- Parses German/English decimals and K/M currency suffixes.
- Scores Performance, Value, Financial, Development, Role Fit and Confidence.
- Keeps Confidence visible so incomplete scouting data is not disguised as certainty.
- Detects Hidden Gems and budget-friendly/development tags.
- Stores targets and your own squad separately in a local SQLite database.
- Provides search, shortlist and squad-position weakness views.
- Produces BUY / CONSIDER / WATCH / PASS transfer decisions.
- Calculates max sensible bid, max weekly wage and estimated first-year cost against club constraints.
- Creates user-selected SQLite backups.

## Windows delivery target

The packaged release is built with Electron and NSIS. The end user does **not** need Python, Node.js, npm, Visual Studio or a manually started local server. The installer creates Start Menu and Desktop shortcuts and leaves the local application database intact on uninstall.

## Get the Windows installer

GitHub Actions builds `FM26-MONEYBALL-HQ-Windows` on pushes to `main`. Open the latest successful **Windows Build** workflow run and download its artifact. Inside is the generated `.exe` installer.

## Local development

```bash
npm install
npm run dev
```

Run tests with `npm test`. Build the Windows installer on Windows with `npm run dist:win`.

## Product focus

Import -> analysis -> squad need -> hidden gems -> transfer decision.

Explicitly out of V1: Match Analysis, Manager Chronicle and FMF LAB.
