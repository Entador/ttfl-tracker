from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from routers import players, games, snapshot
from services.cache import app_cache
from models.database import SessionLocal, get_db

app = FastAPI(
    title="TTFL Tracker API",
    description="API for tracking TTFL (TrashTalk Fantasy League) player picks",
    version="1.0.0"
)

# Configure CORS - allow all origins (read-only public API, no auth)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Pre-load static data on app startup to reduce database queries"""
    db = SessionLocal()
    try:
        app_cache.load_schedule(db)
        print("App ready!")
    except Exception as e:
        print(f"Warning: Could not pre-load cache: {e}")
        print("App will continue but without cached data")
    finally:
        db.close()


# Include routers
app.include_router(players.router, prefix="/api", tags=["players"])
app.include_router(games.router, prefix="/api", tags=["games"])
app.include_router(snapshot.router, prefix="/api", tags=["snapshot"])


@app.get("/")
def read_root():
    """Health check endpoint"""
    return {"status": "ok", "message": "TTFL Tracker API is running"}


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/admin/refresh-cache")
def refresh_cache(db: Session = Depends(get_db)):
    """
    Refresh the application cache (games, teams, players).

    Use this endpoint when:
    - Games are postponed or rescheduled
    - New games or players are added to the database
    - After running daily_update.py script (to refresh injury status)
    """
    try:
        app_cache.load_schedule(db)
        return {
            "status": "success",
            "message": "Application cache refreshed",
            "games_count": sum(len(games) for games in app_cache.games_by_date.values()),
            "dates_count": len(app_cache.games_by_date),
            "teams_count": len(app_cache.teams_by_id),
            "players_count": len(app_cache.players_by_id)
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to refresh cache: {str(e)}"
        }
