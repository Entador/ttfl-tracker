from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import players, games

app = FastAPI(
    title="TTFL Tracker API",
    description="API for tracking TTFL (TrashTalk Fantasy League) player picks",
    version="1.0.0"
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(players.router, prefix="/api", tags=["players"])
app.include_router(games.router, prefix="/api", tags=["games"])


@app.get("/")
def read_root():
    """Health check endpoint"""
    return {"status": "ok", "message": "TTFL Tracker API is running"}


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}
