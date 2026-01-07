# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TTFL Tracker is a web app to optimize daily player picks for TTFL (TrashTalk Fantasy League), a French NBA fantasy game. Users pick one NBA player per night and earn points based on their performance. The 30-day rule prevents picking the same player twice within 30 days.

**TTFL Score Formula:**
```
POSITIVE: PTS + REB + AST + STL + BLK + FGM + 3PM + FTM
NEGATIVE: TOV + FG_missed + 3P_missed + FT_missed
TTFL_SCORE = POSITIVE - NEGATIVE
```

## Tech Stack

- **Backend**: FastAPI (Python 3.12+), SQLAlchemy 2.0, PostgreSQL
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Database**: PostgreSQL (Neon)
- **Hosting**: Vercel (both frontend and backend)
- **Package Managers**: Poetry (backend), pnpm (frontend)
- **Data Source**: `nba_api` Python package

## Development Commands

### Backend (from `/backend`)

```bash
# Install dependencies
poetry install

# Run development server
poetry run uvicorn app:app --reload
# API runs on http://localhost:8000
# API docs at http://localhost:8000/docs

# Create database tables (one-time setup)
poetry run python -c "from models.database import engine, Base; from models import Player, Game; Base.metadata.create_all(bind=engine)"

# Run Python scripts
poetry run python scripts/script_name.py
```

**Environment**: Requires `.env` file with `DATABASE_URL=postgresql://...`

### Frontend (from `/frontend`)

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
# App runs on http://localhost:3000

# Build for production
pnpm build

# Run production build
pnpm start

# Lint
pnpm lint
```

**Environment**: Requires `.env.local` file with `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Architecture

### Backend Structure

```
backend/
├── app.py                  # FastAPI app, CORS config, router registration
├── models/
│   ├── database.py         # SQLAlchemy engine, SessionLocal, get_db()
│   └── __init__.py         # Player, Game, Team, TTFLScore models
├── routers/
│   ├── players.py          # GET /api/players/tonight, GET /api/players/{id}/stats
│   └── games.py            # POST /api/games/pick, GET /api/games/history
├── services/
│   ├── ttfl.py             # calculate_ttfl_score(), calculate_average_ttfl_score()
│   ├── nba_api.py          # NBA API wrapper functions (used by scripts)
│   └── injuries.py         # Fetch injury data from ESPN
└── scripts/
    ├── daily_update.py     # Automated database updates (runs via GitHub Actions)
    ├── populate_db.py      # Initial database population
    └── *.py                # Other maintenance scripts
```

**Key API Endpoints:**
- `GET /api/players/tonight` - Tonight's players with eligibility and avg TTFL
- `GET /api/players/{player_id}/stats` - Recent game history for a player
- `POST /api/games/pick` - Record a player pick
- `GET /api/games/history` - User's pick history

### Frontend Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Main page: tonight's players
│   ├── history/
│   │   └── page.tsx        # Pick history
│   └── players/[id]/
│       └── page.tsx        # Player detail page
├── components/             # React components (PlayerCard, etc.)
└── lib/
    └── api.ts              # API client functions
```

**Routing**: Uses Next.js App Router (file-based routing)

### Data Flow

The app follows a **database-first architecture** where the backend serves data from the database, and a separate daily script updates the database with fresh data from the NBA API.

**Daily Update Cycle (via GitHub Actions cron):**
1. **NBA API → Daily Script**: `daily_update.py` fetches game data, scores, and injury info
2. **Daily Script → Database**: Updates game statuses, TTFL scores, team stats, and injuries
3. **TTFL Score Calculation**: Raw NBA stats → `ttfl.calculate_ttfl_score()` → stored in database

**Request Flow (Backend API):**
1. **Frontend → Backend API**: API calls via `/lib/api.ts` to FastAPI endpoints
2. **Backend Router → Database**: Routers query database using SQLAlchemy models
3. **Backend Router → Services**: Calculate derived values (averages, projections) from DB data
4. **Backend → Frontend**: JSON response with player/game data

**Key Principle**: Backend routers read from the database, not from NBA API directly (except for optional demo mode).

### Database Schema

**players**
- `id` (PK), `nba_player_id` (unique), `name`, `team`

**games**
- `id` (PK), `player_id` (FK), `game_date`, `opponent`, `is_home`, `is_back2back`, `ttfl_score`, `picked`

**Eligibility Query**: Player is eligible if no games with `picked=true` exist in the last 30 days.

## Daily Update Script

The `scripts/daily_update.py` script maintains the database with fresh NBA data. It runs daily via GitHub Actions cron job and can also be run manually.

**What it does:**
1. **Updates game statuses**: Changes games from "scheduled" → "final" based on NBA schedule
2. **Populates TTFL scores**: Fetches box scores for completed games and calculates TTFL scores
3. **Updates team stats**: Refreshes defensive ratings, pace, opponent stats for all teams
4. **Updates injuries**: Fetches current injury reports from ESPN

**Manual usage:**
```bash
# Run all phases
poetry run python scripts/daily_update.py

# Run specific phase only
poetry run python scripts/daily_update.py --games-only
poetry run python scripts/daily_update.py --scores-only
poetry run python scripts/daily_update.py --stats-only
poetry run python scripts/daily_update.py --injuries-only

# Preview changes without committing
poetry run python scripts/daily_update.py --dry-run
```

**Important**: The script uses `nba_api` and is subject to rate limits. It includes retry logic with exponential backoff for timeout errors.

## Important Patterns

### Backend Dependency Injection

All routers use FastAPI's dependency injection for database sessions:

```python
from models.database import get_db
from sqlalchemy.orm import Session

@router.get("/endpoint")
def endpoint(db: Session = Depends(get_db)):
    # db session is auto-managed
```

Some endpoints use `get_optional_db()` to work without a database (API-only mode).

### NBA API Rate Limiting

The NBA API has rate limits and is only called by the daily update script and other maintenance scripts (not by the backend API during normal operation). The `nba_api.py` service includes a 0.6s delay between requests. The daily update script has retry logic with exponential backoff for timeout errors. If you get errors when running scripts manually, wait a few minutes before retrying.

### Frontend Data Fetching

Next.js App Router uses Server Components by default. Client-side fetching is done in components marked with `'use client'` directive.

### TTFL Score Calculation

Always use `services.ttfl.calculate_ttfl_score(box_score)` for consistency. The function handles missing/None values gracefully with `.get()` and `or 0` fallbacks.

## Next.js & React Best Practices

**App Router (Next.js 16):**
- Server Components by default - only add `'use client'` when you need hooks, event handlers, or browser APIs
- Fetch data directly in Server Components with `cache: 'no-store'` for real-time data
- Keep client components small and low in the tree

**shadcn/ui:**
- Copy components into project: `npx shadcn@latest add button`
- Components go in `components/ui/`, customize them directly
- Built on Radix UI (already installed) + Tailwind CSS
- Use `lucide-react` for icons (tree-shakeable)

**Component Organization:**
- Composition over complex props
- One component = one responsibility
- Extract logic to custom hooks
- Define TypeScript interfaces for API responses in `types/`

**Tailwind v4:**
- Config in `app.css` using `@theme` directive (not `tailwind.config.js`)
- Use utility classes: `flex items-center gap-4`, `text-lg font-semibold`

## Design Decisions

**Why store only TTFL score, not raw stats?**
- Simpler data model, user only cares about final score
- Trade-off: Cannot recalculate if formula changes
- Raw stats available via NBA API if needed later

**Why optional database in some endpoints?**
- Allows API to work in "demo mode" without database setup
- Useful for testing NBA API integration independently

**Why separate frontend/backend?**
- Real-world architecture pattern
- Python backend better suited for data/ML work
- Learning opportunity (FastAPI)

## Common Gotchas

1. **Database connection**: If `DATABASE_URL` is invalid, app will fail to start. Check `.env` file.
2. **No games on off-days**: `GET /api/players/tonight` returns `[]` when there are no NBA games scheduled.
3. **Next.js caching**: App Router aggressively caches. Use `cache: 'no-store'` in fetch calls for live data.
4. **SQLAlchemy 2.0**: Uses `Session.query()` pattern (legacy), not the newer `select()` style. Be consistent.
5. **Poetry shell**: Don't activate `poetry shell` - use `poetry run` prefix for commands to avoid path issues.

## Testing Strategy

No formal test suite yet. Manual testing via:
- Backend: FastAPI `/docs` interactive API explorer
- Frontend: Browser testing at `http://localhost:3000`
- Database: Direct SQL queries via Neon console or `psql`

When adding tests, consider:
- Backend: pytest for API endpoints and TTFL score calculations
- Frontend: Jest + React Testing Library for components
