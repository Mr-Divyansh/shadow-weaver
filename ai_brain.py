"""Shadow-Weaver AI Brain — Gemini-powered attack strategy and narration.

Safety: All functions are stubs for demo mode. No real AI calls are made
without a valid GEMINI_KEY in the environment.
"""


def narrate(event_type: str, data: dict) -> str | None:
    """Generate AI narration for an event. Returns None in demo mode."""
    return None


def recommend(events: list) -> str:
    """Generate an AI recommendation based on recent events."""
    return "Contain suspicious source"


def classify_vulns(web, auth, stress) -> list:
    """Classify vulnerabilities from recon findings. Returns empty list in demo mode."""
    return []