from models.database import SessionLocal
from services.nba_api import fetch_tonight_players
from services.ttfl import calculate_average_ttfl_score

def preload_data():
    db = SessionLocal()
    try:
        players = fetch_tonight_players()

        for p in players:
            p["avg_ttfl"] = calculate_average_ttfl_score(p["id"], db)

        return {
            "tonight_players": players
        }
    finally:
        db.close()
