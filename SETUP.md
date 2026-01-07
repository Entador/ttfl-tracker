# TTFL Tracker - Setup Guide

## What's Been Built

### ✅ Backend (FastAPI + Python)
- Database models (Player, Game)
- TTFL score calculation service
- NBA API integration service
- REST API endpoints:
  - `GET /api/players/tonight` - Tonight's players with eligibility
  - `GET /api/players/{id}/stats` - Player stats and history
  - `POST /api/games/pick` - Record a pick
  - `GET /api/games/history` - Pick history

### ✅ Frontend (Next.js 16 + React 19)
- Main page: Tonight's players with pick functionality
- History page: Track past picks and scores
- Player detail page: Individual player stats
- Responsive UI components

### ⚠️ Remaining Setup Steps
1. Install dependencies
2. Set up database (Neon or local PostgreSQL)
3. Configure environment variables
4. Populate database with NBA data
5. Run and test

---

## Step-by-Step Setup

### 1. Install Backend Dependencies

```bash
cd backend

# Install poetry if not already installed
curl -sSL https://install.python-poetry.org | python3 -

# Install dependencies
poetry install

# Verify installation
poetry show
```

### 2. Set Up Database

**Option A: Create Neon Project (Recommended)**

1. Go to [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string from the dashboard
4. It will look like: `postgresql://[user]:[password]@[host]/[database]?sslmode=require`

**Option B: Use Local PostgreSQL**

If you have PostgreSQL installed locally:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/ttfl_tracker
```

### 3. Configure Backend Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your database URL:
```
DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@[HOST]:5432/[DATABASE]
```

### 4. Create Database Tables

Option 1: Using Python
```bash
poetry run python -c "from models.database import engine, Base; from models import Player, Game; Base.metadata.create_all(bind=engine)"
```

Option 2: Using Neon SQL Editor
```sql
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    nba_player_id INTEGER UNIQUE NOT NULL,
    name VARCHAR NOT NULL,
    team VARCHAR NOT NULL
);

CREATE INDEX idx_players_nba_id ON players(nba_player_id);

CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    game_date DATE NOT NULL,
    opponent VARCHAR(3) NOT NULL,
    is_home BOOLEAN NOT NULL,
    is_back2back BOOLEAN DEFAULT FALSE,
    ttfl_score INTEGER NOT NULL,
    picked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_games_player ON games(player_id);
CREATE INDEX idx_games_date ON games(game_date);
CREATE INDEX idx_games_picked ON games(picked);
```

### 5. Start Backend Server

```bash
cd backend
poetry run uvicorn app:app --reload
```

Visit: http://localhost:8000/docs to see the API documentation

### 6. Install Frontend Dependencies

```bash
cd frontend

# Install pnpm if not already installed
npm install -g pnpm

# Install dependencies
pnpm install
```

### 7. Configure Frontend Environment

```bash
cd frontend
cp .env.local.example .env.local
```

The `.env.local` should contain:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 8. Add Tailwind CSS (Optional but Recommended)

The UI uses Tailwind CSS classes. Install it:

```bash
cd frontend
pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p
```

Update `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 9. Start Frontend Server

```bash
cd frontend
pnpm dev
```

Visit: http://localhost:3000

---

## Testing the Application

### Populate Initial Data

Before the application can show any data, you need to populate the database with NBA data:

```bash
cd backend
# Populate teams and players
poetry run python scripts/populate_db.py

# Fetch and populate game data (this may take a few minutes)
poetry run python scripts/daily_update.py
```

The `daily_update.py` script:
- Updates game statuses (scheduled → final)
- Fetches TTFL scores for completed games
- Updates team stats
- Updates player injury information

This script runs automatically via GitHub Actions in production, but you need to run it manually for local development.

### Backend Tests (via FastAPI /docs)

1. Visit http://localhost:8000/docs
2. Try these endpoints:
   - `GET /health` - Should return `{"status": "healthy"}`
   - `GET /api/players/tonight` - Shows tonight's NBA players (from database)
   - `GET /api/games/history` - Should return empty array initially

**Important**: The backend API reads from the database. If you don't see data, run the populate and daily update scripts above.

### Frontend Tests

1. Visit http://localhost:3000
2. Check if tonight's players load (may be empty if no NBA games today)
3. Pick a player (requires games to be available)
4. Visit http://localhost:3000/history to see your pick
5. Click on a player to see their detail page

---

## Troubleshooting

### Backend Issues

**Import errors:**
- Make sure you ran `poetry install`
- Run commands with `poetry run` prefix

**Database connection errors:**
- Verify DATABASE_URL in `.env` is correct
- Test connection: `poetry run python -c "from models.database import engine; engine.connect()"`

**NBA API rate limits:**
- The NBA API may have rate limits
- There's a 0.6s delay built in to avoid hitting limits
- If you get errors, wait a few minutes and try again

### Frontend Issues

**Module not found errors:**
- Run `pnpm install` in the frontend directory
- Delete `node_modules` and `.next` folders, then reinstall

**API connection errors:**
- Make sure backend is running on port 8000
- Check NEXT_PUBLIC_API_URL in `.env.local`
- Check browser console for CORS errors

**No games showing:**
- NBA games only appear on actual game days
- Try the player detail page with a known player ID
- Check backend `/docs` endpoint to verify API is working

---

## Next Steps After MVP

Once everything is working:

1. **Add Tailwind for better styling** (see step 8 above)
2. **Import historical data** - Create `scripts/import_season.py` to populate past games
3. **Deploy** - Both frontend and backend are deployed on Vercel (already done)
4. **Add features** from Phase 2:
   - Stats breakdown by opponent
   - Back-to-back detection
   - Home/away performance splits

---

## Project Structure

```
ttfl-tracker/
├── backend/
│   ├── app.py                  # FastAPI app
│   ├── pyproject.toml          # Poetry deps
│   ├── models/
│   │   ├── database.py         # DB setup
│   │   └── __init__.py         # Player, Game models
│   ├── services/
│   │   ├── ttfl.py            # Score calculation
│   │   └── nba_api.py         # NBA data fetching
│   └── routers/
│       ├── players.py         # Player endpoints
│       └── games.py           # Game/pick endpoints
│
└── frontend/
    ├── package.json           # pnpm deps
    ├── app/
    │   ├── layout.tsx         # Root layout
    │   ├── page.tsx           # Main page (tonight's players)
    │   ├── history/
    │   │   └── page.tsx       # Pick history
    │   └── players/[id]/
    │       └── page.tsx       # Player detail
    ├── components/
    │   ├── PlayerCard.tsx     # Player display
    │   └── EligibilityBadge.tsx
    └── lib/
        └── api.ts             # API client
```

---

## Quick Start Commands

**Terminal 1 (Backend):**
```bash
cd backend
poetry install
poetry run uvicorn app:app --reload
```

**Terminal 2 (Frontend):**
```bash
cd frontend
pnpm install
pnpm dev
```

**Terminal 3 (Database - if using local Postgres):**
```bash
# Start your local PostgreSQL server
```

---

## Support

- Backend API docs: http://localhost:8000/docs
- Frontend: http://localhost:3000
- NBA API docs: https://github.com/swar/nba_api

Happy tracking! 🏀
