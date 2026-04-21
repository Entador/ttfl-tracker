import os
import time
from datetime import datetime

from nba_api.stats.endpoints import playergamelog, leaguedashteamstats, boxscoretraditionalv3, scheduleleaguev2, commonteamroster


class NBAClient:
    def __init__(self, rate_limit_delay=0.6, max_retries=3):
        self.proxy_url = os.getenv('PROXY_URL')
        self.rate_limit_delay = rate_limit_delay
        self.max_retries = max_retries

    # --- Private utilities ---

    @staticmethod
    def _safe_int(val):
        if val is None or (isinstance(val, float) and val != val):
            return 0
        try:
            return int(val)
        except (ValueError, TypeError):
            return 0

    @staticmethod
    def _get_current_season() -> str:
        now = datetime.now()
        year, month = now.year, now.month
        if month >= 10:
            return f"{year}-{str(year + 1)[-2:]}"
        return f"{year - 1}-{str(year)[-2:]}"

    @staticmethod
    def _extract_opponent(matchup: str) -> str:
        if '@' in matchup:
            return matchup.split('@')[1].strip()
        elif 'vs.' in matchup:
            return matchup.split('vs.')[1].strip()
        return ''

    # --- Private network ---

    def _call(self, endpoint_cls, **kwargs):
        for attempt in range(self.max_retries):
            try:
                time.sleep(self.rate_limit_delay)
                return endpoint_cls(proxy=self.proxy_url, timeout=60, **kwargs)
            except Exception as e:
                is_timeout = 'timed out' in str(e).lower() or 'timeout' in str(e).lower()
                is_last_attempt = attempt == self.max_retries - 1

                if is_last_attempt or not is_timeout:
                    raise

                wait_time = 2 ** attempt
                print(f"Timeout, retrying in {wait_time}s (attempt {attempt + 1}/{self.max_retries})")
                time.sleep(wait_time)

    # --- Private parsers ---

    def _parse_player_stats(self, games_df, num_recent_games: int) -> list[dict]:
        if games_df.empty:
            return []

        game_stats = []
        for _, game in games_df.head(num_recent_games).iterrows():
            game_stats.append({
                'game_date': game.get('GAME_DATE', ''),
                'matchup': game.get('MATCHUP', ''),
                'opponent': self._extract_opponent(game.get('MATCHUP', '')),
                'is_home': '@' not in game.get('MATCHUP', ''),
                'PTS': self._safe_int(game.get('PTS')),
                'REB': self._safe_int(game.get('REB')),
                'AST': self._safe_int(game.get('AST')),
                'STL': self._safe_int(game.get('STL')),
                'BLK': self._safe_int(game.get('BLK')),
                'TOV': self._safe_int(game.get('TOV')),
                'FGM': self._safe_int(game.get('FGM')),
                'FGA': self._safe_int(game.get('FGA')),
                'FG3M': self._safe_int(game.get('FG3M')),
                'FG3A': self._safe_int(game.get('FG3A')),
                'FTM': self._safe_int(game.get('FTM')),
                'FTA': self._safe_int(game.get('FTA')),
            })
        return game_stats

    def _parse_box_scores(self, players_df) -> list[dict]:
        if players_df.empty:
            return []

        results = []
        for _, row in players_df.iterrows():
            min_str = str(row.get('minutes', '') or row.get('MIN', '') or '')
            minutes = 0
            if ':' in min_str:
                try:
                    minutes = int(min_str.split(':')[0])
                except (ValueError, IndexError):
                    pass
            elif 'PT' in min_str and 'M' in min_str:
                try:
                    minutes = int(min_str.split('PT')[1].split('M')[0])
                except (ValueError, IndexError):
                    pass

            results.append({
                'nba_player_id': self._safe_int(row.get('personId') or row.get('PLAYER_ID')),
                'player_name': row.get('name', '') or row.get('PLAYER_NAME', ''),
                'team_abbreviation': row.get('teamTricode', '') or row.get('TEAM_ABBREVIATION', ''),
                'minutes': minutes,
                'PTS': self._safe_int(row.get('points') or row.get('PTS')),
                'REB': self._safe_int(row.get('reboundsTotal') or row.get('REB')),
                'AST': self._safe_int(row.get('assists') or row.get('AST')),
                'STL': self._safe_int(row.get('steals') or row.get('STL')),
                'BLK': self._safe_int(row.get('blocks') or row.get('BLK')),
                'TOV': self._safe_int(row.get('turnovers') or row.get('TOV')),
                'FGM': self._safe_int(row.get('fieldGoalsMade') or row.get('FGM')),
                'FGA': self._safe_int(row.get('fieldGoalsAttempted') or row.get('FGA')),
                'FG3M': self._safe_int(row.get('threePointersMade') or row.get('FG3M')),
                'FG3A': self._safe_int(row.get('threePointersAttempted') or row.get('FG3A')),
                'FTM': self._safe_int(row.get('freeThrowsMade') or row.get('FTM')),
                'FTA': self._safe_int(row.get('freeThrowsAttempted') or row.get('FTA')),
            })
        return results

    def _parse_team_stats(self, base_df, advanced_df, opp_df) -> list[dict]:
        merged = base_df[['TEAM_ID', 'TEAM_NAME', 'W', 'L']].merge(
            advanced_df[['TEAM_ID', 'PACE', 'DEF_RATING']], on='TEAM_ID'
        ).merge(
            opp_df[['TEAM_ID', 'OPP_PTS', 'OPP_REB', 'OPP_AST', 'OPP_FGM', 'OPP_FG3M', 'OPP_FGA', 'OPP_TOV', 'OPP_STL', 'OPP_BLK']],
            on='TEAM_ID'
        )

        results = []
        for _, row in merged.iterrows():
            opp_fga = float(row.get('OPP_FGA') or 0)
            opp_efg = 0.0
            if opp_fga > 0:
                opp_efg = (float(row.get('OPP_FGM') or 0) + 0.5 * float(row.get('OPP_FG3M') or 0)) / opp_fga

            results.append({
                'nba_team_id': int(row['TEAM_ID']),
                'team_name': row['TEAM_NAME'],
                'wins': self._safe_int(row.get('W')),
                'losses': self._safe_int(row.get('L')),
                'pace': float(row.get('PACE') or 0),
                'def_rating': float(row.get('DEF_RATING') or 0),
                'opp_ppg': float(row.get('OPP_PTS') or 0),
                'opp_rpg': float(row.get('OPP_REB') or 0),
                'opp_apg': float(row.get('OPP_AST') or 0),
                'opp_efg_pct': opp_efg,
                'opp_tov': float(row.get('OPP_TOV') or 0),
                'opp_stl': float(row.get('OPP_STL') or 0),
                'opp_blk': float(row.get('OPP_BLK') or 0),
            })
        return results

    # --- Public API ---

    def get_schedule(self, season: str | None = None):
        if season is None:
            season = self._get_current_season()
        endpoint = self._call(scheduleleaguev2.ScheduleLeagueV2, season=season, league_id="00")
        return endpoint.season_games.get_data_frame()

    def get_team_roster(self, team_id: int, season: str | None = None):
        if season is None:
            season = self._get_current_season()
        endpoint = self._call(commonteamroster.CommonTeamRoster, team_id=team_id, season=season)
        return endpoint.common_team_roster.get_data_frame()



    def get_player_stats(self, player_id: int, num_recent_games: int = 10) -> list[dict]:
        gamelog = self._call(
            playergamelog.PlayerGameLog,
            player_id=player_id,
            season=self._get_current_season(),
            season_type_all_star='Regular Season',
        )
        return self._parse_player_stats(gamelog.get_data_frames()[0], num_recent_games)

    def get_game_box_scores(self, game_id: str) -> list[dict]:
        box_score = self._call(boxscoretraditionalv3.BoxScoreTraditionalV3, game_id=game_id)
        return self._parse_box_scores(box_score.player_stats.get_data_frame())

    def get_all_team_stats(self, season: str | None = None) -> list[dict]:
        if season is None:
            season = self._get_current_season()

        common_params = dict(
            season=season,
            season_type_all_star='Regular Season',
            per_mode_detailed='PerGame',
        )
        base = self._call(leaguedashteamstats.LeagueDashTeamStats, **common_params, measure_type_detailed_defense='Base')
        advanced = self._call(leaguedashteamstats.LeagueDashTeamStats, **common_params, measure_type_detailed_defense='Advanced')
        opp = self._call(leaguedashteamstats.LeagueDashTeamStats, **common_params, measure_type_detailed_defense='Opponent')

        return self._parse_team_stats(
            base.get_data_frames()[0],
            advanced.get_data_frames()[0],
            opp.get_data_frames()[0],
        )
