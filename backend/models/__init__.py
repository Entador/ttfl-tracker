from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, DateTime, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True, index=True)
    nba_team_id = Column(Integer, unique=True, nullable=False)
    abbreviation = Column(String(3), nullable=False)
    full_name = Column(String, nullable=False)

    # Record
    wins = Column(Integer, nullable=True)
    losses = Column(Integer, nullable=True)

    # Tempo & Defense
    pace = Column(Float, nullable=True)
    def_rating = Column(Float, nullable=True)

    # Opponent stats (what they allow - key for TTFL prediction)
    opp_ppg = Column(Float, nullable=True)
    opp_rpg = Column(Float, nullable=True)
    opp_apg = Column(Float, nullable=True)
    opp_efg_pct = Column(Float, nullable=True)
    opp_tov = Column(Float, nullable=True)
    opp_stl = Column(Float, nullable=True)
    opp_blk = Column(Float, nullable=True)

    # Metadata
    stats_updated_at = Column(DateTime(timezone=True), nullable=True)

    players = relationship("Player", back_populates="team")

class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True, index=True)
    nba_player_id = Column(Integer, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"))
    is_active = Column(Boolean, default=True)

    # Injury status from ESPN
    injury_status = Column(String(20), nullable=True)
    injury_return_date = Column(String(20), nullable=True)

    team = relationship("Team", back_populates="players")
    ttfl_scores = relationship("TTFLScore", back_populates="player", cascade="all, delete-orphan")

class Game(Base):
    __tablename__ = "games"
    id = Column(Integer, primary_key=True, index=True)
    nba_game_id = Column(String, unique=True, nullable=False, index=True)
    home_team_id = Column(Integer, ForeignKey("teams.id"))
    away_team_id = Column(Integer, ForeignKey("teams.id"))
    game_date = Column(Date, nullable=False, index=True)
    status = Column(String, default="scheduled")  # scheduled | live | final
    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)

    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])

class TTFLScore(Base):
    __tablename__ = "ttfl_scores"
    __table_args__ = (UniqueConstraint("player_id", "game_id", name="uq_player_game"),)

    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    ttfl_score = Column(Integer, nullable=True)
    minutes = Column(Integer, nullable=True)  # Minutes played; 0 or NULL = DNP
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    player = relationship("Player", back_populates="ttfl_scores")
    game = relationship("Game")
