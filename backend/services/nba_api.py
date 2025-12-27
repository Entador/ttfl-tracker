from datetime import datetime
from nba_api.stats.endpoints import playergamelog, scoreboardv2, commonteamroster
from nba_api.stats.static import players, teams
import time


def get_todays_games(game_date: str | None = None) -> list[dict]:
    """
    Fetch NBA games for a specific date.

    Args:
        game_date: Date in YYYY-MM-DD format. If None, defaults to today.

    Returns:
        List of games with structure:
        [{
            'game_id': str,
            'home_team': str,
            'away_team': str,
            'game_time': str,
            'home_players': list[dict],
            'away_players': list[dict]
        }]
    """
    try:
        # If no date provided, use today
        if game_date is None:
            game_date = datetime.now().strftime('%Y-%m-%d')

        # Use ScoreboardV2 for date support
        board = scoreboardv2.ScoreboardV2(
            game_date=game_date,
            league_id='00'  # NBA
        )

        # Get game data from ScoreboardV2
        games_df = board.game_header.get_data_frame()

        if games_df.empty:
            return []

        # Map ScoreboardV2 structure to our expected format
        all_teams = teams.get_teams()
        games = []

        for _, game in games_df.iterrows():
            # Get team tricodes from team IDs
            home_team_id = game['HOME_TEAM_ID']
            visitor_team_id = game['VISITOR_TEAM_ID']

            home_team = next((t for t in all_teams if t['id'] == home_team_id), None)
            visitor_team = next((t for t in all_teams if t['id'] == visitor_team_id), None)

            if not home_team or not visitor_team:
                continue

            games.append({
                'game_id': str(game['GAME_ID']),
                'home_team': home_team['abbreviation'],
                'away_team': visitor_team['abbreviation'],
                'game_time': game.get('GAME_STATUS_TEXT', ''),
                'status': game.get('GAME_STATUS_TEXT', 'Scheduled')
            })

        return games

    except Exception as e:
        import traceback
        print(f"Error fetching games for {game_date}: {e}")
        print(traceback.format_exc())
        return []


def get_active_players_in_game(team_tricode: str) -> list[dict]:
    """
    Get players from a team by team tricode (e.g., 'LAL', 'BOS').

    Returns:
        List of players: [{'id': int, 'name': str, 'team': str}]
    """
    try:
        all_teams = teams.get_teams()
        team = next((t for t in all_teams if t['abbreviation'] == team_tricode), None)

        if not team:
            return []

        # Rate limiting
        time.sleep(0.6)

        # Fetch actual roster from NBA API
        roster = commonteamroster.CommonTeamRoster(
            team_id=team['id'],
            season=get_current_season()
        )
        roster_df = roster.common_team_roster.get_data_frame()

        if roster_df.empty:
            return []

        team_players = [
            {
                'id': int(row['PLAYER_ID']),
                'name': row['PLAYER'],
                'team': team_tricode
            }
            for _, row in roster_df.iterrows()
        ]

        return team_players

    except Exception as e:
        print(f"Error fetching players for {team_tricode}: {e}")
        return []


def get_player_stats(player_id: int, num_recent_games: int = 10, max_retries: int = 3) -> list[dict]:
    """
    Fetch recent game stats for a player.

    Args:
        player_id: NBA player ID
        num_recent_games: Number of recent games to fetch
        max_retries: Maximum number of retry attempts on timeout

    Returns:
        List of game stats dictionaries with box score data:
        [{
            'game_date': str,
            'matchup': str,
            'PTS': int, 'REB': int, 'AST': int, etc.
        }]
    """
    for attempt in range(max_retries):
        try:
            # Avoid rate limiting
            time.sleep(0.6)

            current_season = get_current_season()
            gamelog = playergamelog.PlayerGameLog(
                player_id=player_id,
                season=current_season,
                timeout=60  # Increase timeout to 60 seconds
            )

            games_df = gamelog.get_data_frames()[0]

            if games_df.empty:
                return []

            # Take only the most recent N games
            recent_games = games_df.head(num_recent_games)

            game_stats = []
            for _, game in recent_games.iterrows():
                game_stats.append({
                    'game_date': game.get('GAME_DATE', ''),
                    'matchup': game.get('MATCHUP', ''),
                    'opponent': extract_opponent(game.get('MATCHUP', '')),
                    'is_home': '@' not in game.get('MATCHUP', ''),
                    'PTS': int(game.get('PTS', 0) or 0),
                    'REB': int(game.get('REB', 0) or 0),
                    'AST': int(game.get('AST', 0) or 0),
                    'STL': int(game.get('STL', 0) or 0),
                    'BLK': int(game.get('BLK', 0) or 0),
                    'TOV': int(game.get('TOV', 0) or 0),
                    'FGM': int(game.get('FGM', 0) or 0),
                    'FGA': int(game.get('FGA', 0) or 0),
                    'FG3M': int(game.get('FG3M', 0) or 0),
                    'FG3A': int(game.get('FG3A', 0) or 0),
                    'FTM': int(game.get('FTM', 0) or 0),
                    'FTA': int(game.get('FTA', 0) or 0),
                })

            return game_stats

        except Exception as e:
            is_timeout = 'timed out' in str(e).lower() or 'timeout' in str(e).lower()
            is_last_attempt = attempt == max_retries - 1

            if is_timeout and not is_last_attempt:
                wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                print(f"Timeout fetching stats for player {player_id}, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait_time)
                continue

            print(f"Error fetching player stats for player {player_id}: {e}")
            return []

    return []


def get_current_season() -> str:
    """
    Get current NBA season string (e.g., '2024-25').

    NBA season runs from October to April, so:
    - Oct-Dec: current year is first year (e.g., 2024-25 in late 2024)
    - Jan-Sep: current year is second year (e.g., 2024-25 in early 2025)
    """
    now = datetime.now()
    year = now.year
    month = now.month

    if month >= 10:  # October or later
        return f"{year}-{str(year + 1)[-2:]}"
    else:  # January-September
        return f"{year - 1}-{str(year)[-2:]}"


def extract_opponent(matchup: str) -> str:
    """
    Extract opponent team code from matchup string.

    Examples:
        'LAL vs. BOS' -> 'BOS'
        'LAL @ BOS' -> 'BOS'
    """
    if '@' in matchup:
        return matchup.split('@')[1].strip()
    elif 'vs.' in matchup:
        return matchup.split('vs.')[1].strip()
    return ''


def search_player_by_name(name: str) -> dict | None:
    """
    Search for a player by name.

    Args:
        name: Player name (partial match supported)

    Returns:
        Player dict with id and full_name, or None if not found
    """
    try:
        all_players = players.get_active_players()
        matches = [p for p in all_players if name.lower() in p['full_name'].lower()]

        if matches:
            return matches[0]  # Return first match
        return None

    except Exception as e:
        print(f"Error searching for player {name}: {e}")
        return None


def get_player_by_id(player_id: int) -> dict | None:
    """
    Get a player by their NBA ID.

    Args:
        player_id: NBA player ID

    Returns:
        Player dict with id and full_name, or None if not found
    """
    try:
        all_players = players.get_active_players()
        for player in all_players:
            if player['id'] == player_id:
                return player
        return None

    except Exception as e:
        print(f"Error fetching player {player_id}: {e}")
        return None
