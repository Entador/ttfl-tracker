# TTFL Tracker

## Project Overview

A web application to optimize daily player picks for TTFL (TrashTalk Fantasy League), a French NBA fantasy game where you select one player per night and earn points based on their stats.

### The Game Rules

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

## Goals

### Functional Goals

1. View tonight's players with their TTFL stats (average, recent form)
2. Track player eligibility based on 30-day rule
3. Log daily picks
4. Analyze performance by context (opponent, home/away, back-to-back)

### Learning Goals

- Practice full-stack architecture (separate frontend/backend)
- Learn FastAPI (Python backend framework)
- Work with real sports data APIs
- Build foundation for future ML features

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | Next.js 16 + TypeScript | Familiar, modern App Router |
| Backend | FastAPI (Python) | Great for data work, async, industry standard |
| Database | PostgreSQL (Neon) | Free tier, cloud hosted, good UI |
| ORM | SQLAlchemy 2.0 | Industry standard, good learning |
| Data Source | `nba_api` (Python package) | Free, comprehensive NBA stats |
| Hosting | Vercel (both frontend & backend) | Serverless Python support |

use poetry as package manager

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js       │────▶│   FastAPI       │────▶│   PostgreSQL    │
│   (Frontend)    │     │   (Backend API) │  ┌─▶│   (Neon)        │
└─────────────────┘     └─────────────────┘  │  └─────────────────┘
     Vercel                   Vercel          │           ▲
                                              │           │
                        ┌─────────────────────┴───────────┘
                        │  Daily Update Script
                        │  (GitHub Actions cron)
                        └─────────────────┬───────────────
                                          │
                                          ▼
                                   ┌─────────────────┐
                                   │   nba_api       │
                                   │   (NBA API)     │
                                   └─────────────────┘
```

**Data Flow:**
- **Backend API** reads from database to serve requests (no direct NBA API calls)
- **Daily Script** fetches fresh data from NBA API and updates the database
- Runs automatically via GitHub Actions cron job

---

## Data Model

### players

| Column | Type | Description |
|--------|------|-------------|
| id | PK | Auto-increment |
| nba_player_id | INTEGER UNIQUE | Official NBA player ID |
| name | VARCHAR | Player name |
| team | VARCHAR | Current team abbreviation |

### games

| Column | Type | Description |
|--------|------|-------------|
| id | PK | Auto-increment |
| player_id | FK → players | Reference to player |
| game_date | DATE | Date of the game |
| opponent | VARCHAR(3) | Opponent team abbreviation |
| is_home | BOOLEAN | Home game or away |
| is_back2back | BOOLEAN | Second game in consecutive days |
| ttfl_score | INTEGER | Calculated TTFL score |
| picked | BOOLEAN | Whether user picked this player |

### Key Query: Eligible Players

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

## Project Structure

```
ttfl-tracker/
├── frontend/                 # Next.js
│   ├── app/
│   │   ├── page.tsx         # Tonight's players
│   │   ├── history/         # Pick history
│   │   └── players/[id]/    # Player detail
│   └── components/
│       ├── PlayerCard.tsx
│       └── EligibilityBadge.tsx
│
└── backend/                  # FastAPI + Scripts
    ├── app.py               # API entrypoint
    ├── routers/
    │   ├── players.py       # API endpoints for players
    │   └── games.py         # API endpoints for games
    ├── services/
    │   ├── nba_api.py       # NBA API wrapper (used by scripts)
    │   ├── ttfl.py          # Score calculation
    │   └── injuries.py      # Injury data from ESPN
    ├── models/              # SQLAlchemy models
    │   ├── database.py      # DB connection
    │   └── __init__.py      # Player, Game, Team, TTFLScore models
    └── scripts/
        ├── daily_update.py  # Automated DB updates (GitHub Actions)
        ├── populate_db.py   # Initial data population
        └── *.py             # Other maintenance scripts
```

---

## Feature Roadmap

### MVP (Phase 1)

- [ ] Backend: Fetch tonight's games and players from NBA API
- [ ] Backend: Calculate TTFL score from box score stats
- [ ] Database: Store players and game results
- [ ] Frontend: Display tonight's players with TTFL averages
- [ ] Frontend: Mark a player as "picked"
- [ ] Frontend: Show eligible/ineligible status (30-day rule)

### Phase 2

- [ ] Import historical data (2024-25 season)
- [ ] Stats breakdown by opponent
- [ ] Back-to-back detection and display
- [ ] Home/away performance split

---

## Design Decisions

### Why not scrape TTFL site for pick history?

- Requires auth/credentials storage
- Fragile (HTML changes break it)
- Possibly against ToS
- **Decision**: Manual pick logging (one click per day)

### Why store only TTFL score, not raw stats?

- User only cares about final score
- Simpler data model
- Raw stats available via API if needed later
- **Trade-off**: Cannot recalculate if formula changes

### Why separate frontend/backend?

- Real-world architecture pattern
- Python backend better suited for data/ML work
- Learning opportunity (FastAPI)
- Easier to scale independently

---

## Developer Context

- **Developer**: Junior dev with data science background
- **Work sessions**: Evenings (~3h) and weekends
- **Learning focus**: Web development, industry best practices
- **Preferences**: Clarity over cleverness, incremental changes, small functions