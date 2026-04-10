"""
Application data cache service.

Pre-loads static/semi-static data on app startup to reduce database queries:
- Game schedules (static, rarely change)
- Team information (semi-static, updated daily)
- Player rosters (semi-static, updated daily for injuries/trades)
"""

from typing import Dict, List, Optional
from datetime import date, datetime, timezone

INJURY_TTL_SECONDS = 3600  # 1 hour


class AppCache:
    """Pre-loaded application data - static and semi-static data that rarely changes"""

    def __init__(self):
        self.games_by_date: Dict[date, List] = {}
        self.teams_by_id: Dict[int, object] = {}
        self.players_by_id: Dict[int, object] = {}
        self.players_by_nba_id: Dict[int, object] = {}
        self.players_by_team: Dict[int, List] = {}
        self.loaded = False
        self._injuries_loaded_at: Optional[datetime] = None

    def load_schedule(self, db):
        """
        Load entire game schedule and player roster from database on startup.

        Args:
            db: SQLAlchemy database session
        """
        from models import Game, Team, Player
        from sqlalchemy.orm import joinedload

        print("Loading game schedule and players into memory...")

        # Load all teams
        teams = db.query(Team).all()
        self.teams_by_id = {team.id: team for team in teams}
        print(f"  Loaded {len(teams)} teams")

        # Load all games with relationships eager-loaded
        games = (
            db.query(Game)
            .options(joinedload(Game.home_team), joinedload(Game.away_team))
            .all()
        )

        # Group by date for fast lookups
        self.games_by_date = {}
        for game in games:
            game_date = game.game_date
            if game_date not in self.games_by_date:
                self.games_by_date[game_date] = []
            self.games_by_date[game_date].append(game)

        print(f"  Loaded {len(games)} games across {len(self.games_by_date)} dates")

        # Load all players with team relationship eager-loaded
        players = (
            db.query(Player)
            .options(joinedload(Player.team))
            .all()
        )

        # Build multiple indexes for fast lookups
        self.players_by_id = {p.id: p for p in players}
        self.players_by_nba_id = {p.nba_player_id: p for p in players}

        # Group by team for fast team-based filtering
        self.players_by_team = {}
        for player in players:
            if player.team_id not in self.players_by_team:
                self.players_by_team[player.team_id] = []
            self.players_by_team[player.team_id].append(player)

        self.loaded = True
        self._injuries_loaded_at = datetime.now(timezone.utc)
        print(f"  Loaded {len(players)} players")

    def get_games_for_date(self, target_date: date) -> List:
        """
        Get games for a specific date from memory.

        Args:
            target_date: Date to get games for

        Returns:
            List of Game objects for that date
        """
        return self.games_by_date.get(target_date, [])

    def get_team(self, team_id: int) -> Optional[object]:
        """
        Get team from memory.

        Args:
            team_id: Team ID

        Returns:
            Team object or None
        """
        return self.teams_by_id.get(team_id)

    def get_player_by_id(self, player_id: int) -> Optional[object]:
        """
        Get player by internal database ID.

        Args:
            player_id: Internal database player ID

        Returns:
            Player object or None
        """
        return self.players_by_id.get(player_id)

    def get_player_by_nba_id(self, nba_player_id: int) -> Optional[object]:
        """
        Get player by NBA player ID.

        Args:
            nba_player_id: NBA API player ID

        Returns:
            Player object or None
        """
        return self.players_by_nba_id.get(nba_player_id)

    def get_players_by_team(self, team_id: int, active_only: bool = True) -> List:
        """
        Get all players for a team.

        Args:
            team_id: Team ID
            active_only: Only return active players (default: True)

        Returns:
            List of Player objects
        """
        players = self.players_by_team.get(team_id, [])
        if active_only:
            return [p for p in players if p.is_active]
        return players

    def get_active_players_for_teams(self, team_ids: set) -> List:
        """
        Get all active players for multiple teams.

        Args:
            team_ids: Set of team IDs

        Returns:
            List of active Player objects
        """
        result = []
        for team_id in team_ids:
            result.extend(self.get_players_by_team(team_id, active_only=True))
        return result

    def get_all_players(self, active_only: bool = True) -> List:
        """
        Get all players.

        Args:
            active_only: Only return active players (default: True)

        Returns:
            List of Player objects
        """
        players = list(self.players_by_id.values())
        if active_only:
            return [p for p in players if p.is_active]
        return players

    def refresh_injuries_if_stale(self, db) -> bool:
        """
        Re-fetch injury fields from DB if the TTL has expired.

        Only queries the 3 injury columns — does not reload the full cache.
        Called on each snapshot request; no-ops if data is still fresh.

        Returns True if a refresh was performed.
        """
        if not self.loaded:
            return False

        now = datetime.now(timezone.utc)
        if (self._injuries_loaded_at is not None and
                (now - self._injuries_loaded_at).total_seconds() < INJURY_TTL_SECONDS):
            return False

        from models import Player
        from sqlalchemy import text

        rows = db.execute(
            text("SELECT id, injury_status, injury_return_date, injury_details FROM players")
        ).fetchall()

        for row in rows:
            player = self.players_by_id.get(row.id)
            if player:
                player.injury_status = row.injury_status
                player.injury_return_date = row.injury_return_date
                player.injury_details = row.injury_details

        self._injuries_loaded_at = now
        print(f"Cache: refreshed injury data for {len(rows)} players")
        return True

    def clear(self):
        """Clear the cache"""
        self.games_by_date = {}
        self.teams_by_id = {}
        self.players_by_id = {}
        self.players_by_nba_id = {}
        self.players_by_team = {}
        self.loaded = False
        self._injuries_loaded_at = None


# Global singleton
app_cache = AppCache()
