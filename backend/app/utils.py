"""Utility: recursively sanitize a dict/list for JSON serialization.

Python's stdlib json rejects NaN and Inf; they can appear from:
  - pyloudnorm returning -inf for silence
  - log10(0) in dBFS / dBTP calculations
  - float("nan") from unavailable LRA on short clips
  - crest factor of a completely silent signal

We replace them with None so the front end receives null and can show "—".
"""

import math


def sanitize(obj):
    """Recursively replace non-finite floats with None."""
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else obj
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj
