"""
Migration script to add team stats columns to teams table.

Usage:
    poetry run python scripts/add_team_stats_columns.py
"""

import sys
sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from sqlalchemy import text
from models.database import engine


COLUMNS = [
    # Record
    ("wins", "INTEGER"),
    ("losses", "INTEGER"),
    # Tempo & Defense
    ("pace", "REAL"),
    ("def_rating", "REAL"),
    # Opponent stats
    ("opp_ppg", "REAL"),
    ("opp_rpg", "REAL"),
    ("opp_apg", "REAL"),
    ("opp_efg_pct", "REAL"),
    ("opp_tov", "REAL"),
    ("opp_stl", "REAL"),
    ("opp_blk", "REAL"),
    # Metadata
    ("stats_updated_at", "TIMESTAMPTZ"),
]


def main():
    if engine is None:
        print("ERROR: DATABASE_URL not set")
        return

    print("Adding team stats columns to teams table...\n")

    with engine.connect() as conn:
        for col_name, col_type in COLUMNS:
            # Check if column exists
            result = conn.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'teams' AND column_name = :col_name
            """), {"col_name": col_name})

            if result.fetchone():
                print(f"  [skip]  {col_name} (already exists)")
            else:
                conn.execute(text(f"ALTER TABLE teams ADD COLUMN {col_name} {col_type}"))
                conn.commit()
                print(f"  [added] {col_name}")

    print("\nDone!")


if __name__ == "__main__":
    main()
