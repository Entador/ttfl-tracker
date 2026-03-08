# TTFL Tracker

A web app to optimize daily player picks for TTFL (TrashTalk Fantasy League), a French NBA fantasy game where you pick one player per night and earn points based on their performance.

## The Game

- Pick one NBA player per night
- Score = player's TTFL score (calculated from box score stats)
- **30-day rule**: Cannot pick the same player twice within 30 days
- Goal: Maximize total points over the season

### TTFL Score Formula

```
POSITIVE: PTS + REB + AST + STL + BLK + FGM + 3PM + FTM
NEGATIVE: TOV + FG_missed + 3P_missed + FT_missed

TTFL_SCORE = POSITIVE - NEGATIVE
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| UI | shadcn/ui, Radix UI, lucide-react |
| Frontend Data | SWR (client-side caching) |
| Backend | FastAPI (Python 3.12+) |
| Database | PostgreSQL (Neon) |
| ORM | SQLAlchemy 2.0 |
| Data Source | `nba_api` Python package + ESPN (injuries) |
| Package Managers | Poetry (backend), pnpm (frontend) |
| Hosting | Vercel (frontend + backend) |
| CI | GitHub Actions (daily data updates) |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js       │────▶│   FastAPI        │────▶│   PostgreSQL    │
│   (Frontend)    │     │   (Backend API)  │     │   (Neon)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     Vercel                   Vercel                      ▲
                         ┌────────────────────────────────┘
                         │  Daily Update Script
                         │  (GitHub Actions cron)
                         └──────────────────────┐
                                                ▼
                                       ┌─────────────────┐
                                       │   nba_api       │
                                       │   (NBA API)     │
                                       └─────────────────┘
```

### Snapshot-Based Data Flow

The app uses a **fetch-once, filter-client-side** pattern for instant navigation:

1. On page load, frontend makes a single `GET /api/snapshot` call (~30 KB JSON)
2. The snapshot contains the entire season's games, teams, and players
3. Date navigation filters cached data in-browser — no additional API calls
4. Backend serves from an **in-memory cache** (loaded on startup) + database for TTFL averages
5. Pick management uses `localStorage`; eligibility is calculated client-side

### Daily Update Cycle (GitHub Actions)

1. `daily_update.py` fetches game results and box scores from NBA API
2. Calculates TTFL scores and updates the database
3. Also refreshes team stats (defensive rating, pace) and injury reports (ESPN)
4. Backend cache is refreshed by redeploying after the update

---

## Project Structure

```
ttfl-tracker/
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Dashboard with date navigation
│   │   ├── history/page.tsx      # Pick history
│   │   └── players/[id]/page.tsx # Player detail
│   ├── components/
│   │   ├── PlayersView.tsx        # Client component: snapshot fetch, filter, sort
│   │   ├── PlayersTable.tsx       # Table with skeleton loader
│   │   ├── PlayerFilters.tsx      # Sort/filter controls
│   │   └── ...
│   └── lib/
│       ├── api.ts                 # API client functions
│       ├── snapshot.ts            # Client-side filtering utilities
│       └── picks.ts               # localStorage pick management
│
└── backend/
    ├── app.py                     # FastAPI app, CORS, router registration
    ├── routers/
    │   ├── players.py             # /api/players/* endpoints
    │   └── games.py               # /api/games/* endpoints
    ├── services/
    │   ├── cache.py               # In-memory cache (loaded on startup)
    │   ├── ttfl.py                # TTFL score calculation
    │   ├── nba_api.py             # NBA API wrapper (used by scripts)
    │   └── injuries.py            # ESPN injury data
    ├── models/
    │   ├── database.py            # SQLAlchemy engine, SessionLocal, get_db()
    │   └── __init__.py            # Player, Game, Team, TTFLScore models
    └── scripts/
        ├── daily_update.py        # Automated DB updates (GitHub Actions)
        ├── populate_db.py         # Initial data population
        └── *.py                   # Other maintenance scripts
```

---

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/snapshot` | Full season data for client-side filtering (primary endpoint) |
| `GET` | `/api/players/tonight` | Tonight's players with eligibility and avg TTFL |
| `GET` | `/api/players/{id}/stats` | Recent game history for a player |
| `POST` | `/api/games/pick` | Record a pick |
| `GET` | `/api/games/history` | User's pick history |

---

## Database Schema

### players

| Column | Type | Description |
|--------|------|-------------|
| id | PK | Auto-increment |
| nba_player_id | INTEGER UNIQUE | Official NBA player ID |
| name | VARCHAR | Player name |
| team | VARCHAR | Team abbreviation |

### games

| Column | Type | Description |
|--------|------|-------------|
| id | PK | Auto-increment |
| player_id | FK → players | Reference to player |
| game_date | DATE | Date of the game |
| opponent | VARCHAR(3) | Opponent team abbreviation |
| is_home | BOOLEAN | Home or away |
| is_back2back | BOOLEAN | Second game in consecutive days |
| ttfl_score | INTEGER | Calculated TTFL score (null if scheduled) |
| picked | BOOLEAN | Whether user picked this player |

### Eligibility Query

```sql
SELECT p.* FROM players p
WHERE NOT EXISTS (
  SELECT 1 FROM games g
  WHERE g.player_id = p.id
    AND g.picked = true
    AND g.game_date > CURRENT_DATE - INTERVAL '30 days'
)
```

---

## Development Setup

### Backend (from `/backend`)

```bash
poetry install
poetry run uvicorn app:app --reload
# API at http://localhost:8000
# Docs at http://localhost:8000/docs
```

Requires `.env` with `DATABASE_URL=postgresql://...`

### Frontend (from `/frontend`)

```bash
pnpm install
pnpm dev
# App at http://localhost:3000
```

Requires `.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`

### Daily Update Script

```bash
# Run all phases
poetry run python scripts/daily_update.py

# Run specific phase only
poetry run python scripts/daily_update.py --games-only
poetry run python scripts/daily_update.py --scores-only
poetry run python scripts/daily_update.py --stats-only
poetry run python scripts/daily_update.py --injuries-only

# Preview without committing
poetry run python scripts/daily_update.py --dry-run
```

---

## Design Decisions

**Why snapshot architecture?**
Single API call on load (~30 KB) enables instant date navigation without per-request API calls. Trades slightly larger initial payload for a much snappier UX.

**Why store only TTFL score, not raw stats?**
Simpler data model. Raw stats are available via NBA API if the formula ever changes.

**Why separate frontend/backend?**
Python backend is better suited for data work and future ML features. FastAPI is async and industry-standard.

**Why not scrape TTFL site for pick history?**
Requires credential storage, is fragile to HTML changes, and may be against ToS. Manual pick logging (one click/day) is simpler and more reliable.
