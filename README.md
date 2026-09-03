# FM26 MONEYBALL HQ

Private Windows desktop recruitment and transfer-intelligence application for Football Manager 26.

## Für Benutzer

- Imports FM player exports from CSV, TSV and TXT.
- Erkennt gängige deutsche und englische Spaltennamen automatisch.
- Unterstützt UTF-8, UTF-8 BOM und Windows-1252 sowie Komma, Semikolon und Tabulator.
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

Die veröffentlichte Anwendung wird mit Electron und NSIS paketiert. Endnutzer benötigen **kein** Python, Node.js, npm, Visual Studio und keinen lokalen Server. Der Installer arbeitet pro Benutzer ohne Administratorrechte, erstellt Startmenü- und Desktop-Verknüpfungen und lässt die lokale Anwendungsdatenbank bei einer Deinstallation bestehen.

## Get the Windows installer

GitHub Actions erstellt das Artefakt `FM26-MONEYBALL-HQ-Windows`. Darin liegt `FM26_Moneyball_HQ_Setup.exe`.

1. `FM26_Moneyball_HQ_Setup.exe` öffnen.
2. Installation abschließen.
3. `FM26 MONEYBALL HQ` über Desktop oder Startmenü starten.

Die Datenbank liegt im Electron-Benutzerdatenverzeichnis unter `%APPDATA%`, nicht im Installationsordner. Ein manuelles Backup kann unter **Club & Budget** angelegt werden.

## Für Entwickler

```bash
npm ci
npm run dev
```

Voraussetzung ist Node.js 22. `npm test` führt Parser-, Scoring-, Transfer- und SQLite-Tests aus. `npm run typecheck` prüft TypeScript. `npm run build` führt Tests, Typprüfung und Renderer-Build aus. Unter Windows erzeugt `npm run dist:win` den NSIS-Installer.

### Bewertungsregeln

- Statistiken werden primär innerhalb der erkannten Hauptpositionsgruppe verglichen.
- Kleine Vergleichsgruppen werden zur neutralen Mitte hin regularisiert.
- Fehlende Kennzahlen werden aus der jeweiligen gewichteten Berechnung ausgelassen, nicht als Nullleistung gewertet.
- Der Gesamtscore wird abhängig von der Confidence zur neutralen Mitte hin gedämpft.
- 450 und 900 Minuten bilden die dokumentierten Confidence-Schwellen.
- Unbekannter Marktwert oder unbekanntes Gehalt verhindert `BUY` und `CONSIDER`.
- Überschrittene Clubgrenzen erzwingen `PASS`.

## Product focus

Import -> analysis -> squad need -> hidden gems -> transfer decision.

Explicitly out of V1: Match Analysis, Manager Chronicle and FMF LAB.
