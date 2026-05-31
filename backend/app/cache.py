"""Disk-based cache keyed by content hash (single track) or hash pair (comparison)."""

import json
import os
from pathlib import Path
from typing import Any, Optional

CACHE_DIR = Path(__file__).parent.parent / ".cache"
TRACKS_DIR = CACHE_DIR / "tracks"
COMPARISONS_DIR = CACHE_DIR / "comparisons"
UPLOADS_DIR = Path(__file__).parent.parent / ".uploads"


def ensure_dirs():
    TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISONS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def get_track_path(track_id: str) -> Path:
    return TRACKS_DIR / f"{track_id}.json"


def get_comparison_path(pre_id: str, post_id: str) -> Path:
    return COMPARISONS_DIR / f"{pre_id}__{post_id}.json"


def get_upload_path(track_id: str) -> Optional[Path]:
    for f in UPLOADS_DIR.iterdir():
        if f.stem == track_id:
            return f
    return None


def save_track(track_id: str, data: dict):
    ensure_dirs()
    path = get_track_path(track_id)
    path.write_text(json.dumps(data, allow_nan=True))


def load_track(track_id: str) -> Optional[dict]:
    path = get_track_path(track_id)
    if path.exists():
        return json.loads(path.read_text())
    return None


def save_comparison(pre_id: str, post_id: str, data: dict):
    ensure_dirs()
    path = get_comparison_path(pre_id, post_id)
    path.write_text(json.dumps(data, allow_nan=True))


def load_comparison(pre_id: str, post_id: str) -> Optional[dict]:
    path = get_comparison_path(pre_id, post_id)
    if path.exists():
        return json.loads(path.read_text())
    return None
