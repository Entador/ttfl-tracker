"""
Migration script to add 'minutes' column to ttfl_scores table
and populate it for existing records.

Usage:
    poetry run python scripts/add_minutes_column.py
"""

import sys
sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from sqlalchemy import text
from models.database import engine

def main():
    if engine is None:
        print("ERROR: DATABASE_URL not set")
        return

    with engine.connect() as conn:
        # Check if column exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'ttfl_scores' AND column_name = 'minutes'
        """))

        if result.fetchone():
            print("Column 'minutes' already exists")
        else:
            print("Adding 'minutes' column to ttfl_scores...")
            conn.execute(text("ALTER TABLE ttfl_scores ADD COLUMN minutes INTEGER"))
            conn.commit()
            print("Done!")

        # Show current state
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total,
                COUNT(minutes) as with_minutes,
                COUNT(*) - COUNT(minutes) as without_minutes
            FROM ttfl_scores
        """))
        row = result.fetchone()
        print(f"\nCurrent state:")
        print(f"  Total records: {row[0]}")
        print(f"  With minutes: {row[1]}")
        print(f"  Without minutes: {row[2]}")


if __name__ == "__main__":
    main()
