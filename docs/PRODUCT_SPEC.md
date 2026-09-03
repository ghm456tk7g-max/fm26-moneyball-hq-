# FM26 MONEYBALL HQ - Product Specification

## North Star
Turn Football Manager exports into actionable recruitment decisions faster and more reliably than manual filtering.

## Core workflow
FM export -> drag/drop import -> automatic mapping -> normalization -> scoring -> squad needs -> target ranking -> transfer decision.

## V1 modules

### Import Engine
- CSV, TSV and TXT imports
- encoding and delimiter detection
- German/English column aliases
- currency parsing including K/M suffixes
- reusable mapping profiles
- validation report rather than silent data loss

### Player Intelligence
Every player receives transparent component scores (0-100):
- Performance
- Value
- Financial
- Development
- Role Fit
- Confidence

A composite Moneyball Score is allowed only when its component scores and confidence are visible.

### Recruitment Board
- filters and sorting
- Hidden Gem tags
- shortlist states
- player comparison
- reasons-for / risks-against each recommendation

### Squad Intelligence
- own-squad import
- depth by position/role
- weakest roles
- replacement/upgrading opportunities
- compare target to current starter and backup

### Transfer Decision Engine
- estimated total first-year cost
- contract total cost
- max sensible transfer fee
- max sensible wage
- budget impact
- BUY / CONSIDER / WATCH / PASS recommendation
- recommendation explanation

## Explicit non-goals for V1
- Match analysis
- Manager chronicle
- FMF reverse engineering / FMF LAB
- complete career-management replacement for Football Manager

## Quality gates
1. No required developer runtime on end-user Windows machine.
2. Import errors are visible and recoverable.
3. Scores are deterministic and testable.
4. Missing data reduces confidence rather than silently becoming zero.
5. Financial recommendations cannot exceed configured club constraints without an explicit warning.
6. User data is stored locally.
7. Backup/export exists before V1 is called complete.

## Initial tactical profile
The engine must support configurable roles. The first preset will target the user's current 4-2-3-1 shape while avoiding hard-coding the whole application to one formation.
