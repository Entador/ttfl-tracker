import unicodedata

def normalize_name(name: str) -> str:
    """Normalize player name for matching (lowercase, remove accents)."""
    # Remove accents: é -> e, ć -> c, ū -> u, etc.
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_name.lower().strip()