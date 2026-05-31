"""POST /api/analyze — full comparison: alignment + per-track + delta."""

import math
from typing import Any

from fastapi import APIRouter, HTTPException

from app import alignment as align_mod, cache, decoder, metrics
from app.models import AnalyzeRequest, ComparisonResult
from app.utils import sanitize

router = APIRouter()


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    pre_id, post_id = req.pre_id, req.post_id

    # Serve from cache if available
    cached = cache.load_comparison(pre_id, post_id)
    if cached is not None:
        return cached

    # Load track data from cache
    pre_data = cache.load_track(pre_id)
    post_data = cache.load_track(post_id)
    if pre_data is None:
        raise HTTPException(404, f"PRE track '{pre_id}' not found — upload it first")
    if post_data is None:
        raise HTTPException(404, f"POST track '{post_id}' not found — upload it first")

    # Reload audio for alignment (needed for cross-correlation)
    pre_path = cache.get_upload_path(pre_id)
    post_path = cache.get_upload_path(post_id)
    if pre_path is None or post_path is None:
        raise HTTPException(
            409,
            "Audio files are not available for alignment. "
            "Re-upload the files to recompute the comparison.",
        )

    try:
        pre_audio, pre_sr, _, _ = decoder.load_audio(pre_path)
        post_audio, post_sr, _, _ = decoder.load_audio(post_path)
    except Exception as e:
        raise HTTPException(422, f"Failed to reload audio: {e}")

    if pre_sr != post_sr:
        # Warn but continue; alignment operates on whichever sr pre has
        pass

    # Compute alignment
    try:
        alignment = align_mod.compute_alignment(pre_audio, post_audio, pre_sr)
    except Exception as e:
        raise HTTPException(500, f"Alignment failed: {e}")

    # Build comparison result from cached per-track analysis
    pre_analysis = pre_data["analysis"]
    post_analysis = post_data["analysis"]

    delta = _compute_delta(pre_analysis["metrics"], post_analysis["metrics"])
    spectrum_diff = _compute_spectrum_diff(pre_analysis["spectrum"], post_analysis["spectrum"])

    result = {
        "alignment": alignment,
        "pre": {
            "track_id": pre_id,
            "metrics": pre_analysis["metrics"],
            "spectrum": pre_analysis["spectrum"],
            "loudness_series": pre_analysis["loudness_series"],
        },
        "post": {
            "track_id": post_id,
            "metrics": post_analysis["metrics"],
            "spectrum": post_analysis["spectrum"],
            "loudness_series": post_analysis["loudness_series"],
        },
        "delta": delta,
        "spectrum_diff": spectrum_diff,
    }

    result = sanitize(result)
    cache.save_comparison(pre_id, post_id, result)
    return result


def _safe_diff(a: Any, b: Any) -> Any:
    try:
        if a is None or b is None:
            return None
        fa, fb = float(a), float(b)
        if not (math.isfinite(fa) and math.isfinite(fb)):
            return None
        return round(fb - fa, 4)
    except (TypeError, ValueError):
        return None


def _compute_delta(pre_m: dict, post_m: dict) -> dict:
    def d(section: str, key: str):
        return _safe_diff(
            pre_m.get(section, {}).get(key),
            post_m.get(section, {}).get(key),
        )

    return {
        "integrated_lufs": d("loudness", "integrated_lufs"),
        "lra": d("loudness", "lra"),
        "max_momentary_lufs": d("loudness", "max_momentary_lufs"),
        "max_short_term_lufs": d("loudness", "max_short_term_lufs"),
        "sample_peak_dbfs": d("peaks", "sample_peak_dbfs"),
        "true_peak_dbtp": d("peaks", "true_peak_dbtp"),
        "crest_factor_db": d("dynamics", "crest_factor_db"),
        "psr_db": d("dynamics", "psr_db"),
        "rms_dbfs": d("dynamics", "rms_dbfs"),
        "centroid_hz": d("spectral", "centroid_hz"),
        "rolloff_hz": d("spectral", "rolloff_hz"),
        "flatness": d("spectral", "flatness"),
        "clip_count": _safe_diff(
            pre_m.get("quality", {}).get("clip_count"),
            post_m.get("quality", {}).get("clip_count"),
        ),
        "dc_offset_l": d("quality", "dc_offset_l"),
        "dc_offset_r": d("quality", "dc_offset_r"),
        "phase_correlation": d("quality", "phase_correlation"),
        "noise_floor_dbfs": d("quality", "noise_floor_dbfs"),
    }


def _compute_spectrum_diff(pre_spec: dict, post_spec: dict) -> dict:
    """
    Frequency-response difference curve: POST − PRE in dB.
    Both spectra must share the same freq grid (they do — same log bins).
    """
    pre_freqs = pre_spec["freqs"]
    pre_db = pre_spec["db"]
    post_db = post_spec["db"]

    # Use the shorter common length in case tracks have different sample rates
    n = min(len(pre_db), len(post_db), len(pre_freqs))
    diff_db = [round(post_db[i] - pre_db[i], 3) for i in range(n)]

    return {
        "freqs": pre_freqs[:n],
        "db": diff_db,
    }
