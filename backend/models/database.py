from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Test connections before use, reconnect if stale
        pool_recycle=300,    # Recycle connections after 5 minutes
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    # Allow server to start without database for testing API docs
    engine = None
    SessionLocal = None
    print("⚠️  WARNING: DATABASE_URL not set. Database operations will fail.")

Base = declarative_base()


def get_db():
    """Dependency for FastAPI to get database session"""
    if SessionLocal is None:
        raise RuntimeError("Database not configured. Set DATABASE_URL environment variable.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
