"""
POST /api/region-analyze — re-run comparison metrics on a time-bounded slice.

Used by the frontend when the user drag-selects a region on the waveform.
Loads only the required slice from disk (O(slice) not O(file) for WAV/FLAC).
Caches per (pre_id, post_id, start_rounded, end_rounded) so re-selecting the
same region is instant.
"""

import math
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import alignment as align_mod, cache, decoder, metrics
from app.utils import sanitize

router = APIRouter()


class RegionRequest(BaseModel):
    pre_id: str
    post_id: str
    start_sec: float
    end_sec: float


@router.post("/region-analyze")
async def region_analyze(req: RegionRequest):
    # Validate bounds
    if req.end_sec <= req.start_sec:
        raise HTTPException(400, "end_sec must be greater than start_sec")
    if req.end_sec - req.start_sec < 0.5:
        raise HTTPException(400, "Region must be at least 0.5 s wide")

    # Round to 100 ms for cache key stability when user drags slightly
    start_r = round(req.start_sec, 1)
    end_r   = round(req.end_sec,   1)
    cache_key = f"region_{start_r:.1f}_{end_r:.1f}"

    cached = cache.load_comparison(f"{req.pre_id}__{cache_key}", req.post_id)
    if cached is not None:
        return cached

    # Load track info to get sample rate
    pre_data  = cache.load_track(req.pre_id)
    post_data = cache.load_track(req.post_id)
    if pre_data is None:
        raise HTTPException(404, f"PRE track '{req.pre_id}' not found")
    if post_data is None:
        raise HTTPException(404, f"POST track '{req.post_id}' not found")

    pre_path  = cache.get_upload_path(req.pre_id)
    post_path = cache.get_upload_path(req.post_id)
    if pre_path is None or post_path is None:
        raise HTTPException(409, "Audio files unavailable on disk. Re-upload to restore.")

    try:
        pre_audio, pre_sr   = _load_slice(pre_path,  req.start_sec, req.end_sec)
        post_audio, post_sr = _load_slice(post_path, req.start_sec, req.end_sec)
    except Exception as e:
        raise HTTPException(422, f"Failed to load audio slice: {e}")

    # Per-region analysis (no spectrogram needed)
    try:
        pre_analysis  = metrics.analyze_track(pre_audio,  pre_sr,  compute_spectrogram=False)
        post_analysis = metrics.analyze_track(post_audio, post_sr, compute_spectrogram=False)
        alignment = align_mod.compute_alignment(pre_audio, post_audio, pre_sr)
    except Exception as e:
        raise HTTPException(500, f"Region analysis failed: {e}")

    from app.routers.analyze import _compute_delta, _compute_spectrum_diff
    delta        = _compute_delta(pre_analysis["metrics"], post_analysis["metrics"])
    spectrum_diff = _compute_spectrum_diff(pre_analysis["spectrum"], post_analysis["spectrum"])

    result = {
        "region": {"start_sec": req.start_sec, "end_sec": req.end_sec},
        "alignment": alignment,
        "pre":  {"track_id": req.pre_id,  **_strip(pre_analysis)},
        "post": {"track_id": req.post_id, **_strip(post_analysis)},
        "delta": delta,
        "spectrum_diff": spectrum_diff,
    }

    result = sanitize(result)
    cache.save_comparison(f"{req.pre_id}__{cache_key}", req.post_id, result)
    return result


def _load_slice(path: Path, start_sec: float, end_sec: float):
    """Load a time slice from disk efficiently. WAV/FLAC support random access."""
    suffix = path.suffix.lower()
    if suffix in decoder.SUPPORTED_NATIVE:
        info = sf.info(str(path))
        sr = info.samplerate
        start_f = max(0, int(start_sec * sr))
        end_f   = min(info.frames, int(end_sec * sr))
        audio, _ = sf.read(str(path), start=start_f, stop=end_f,
                           dtype="float32", always_2d=True)
        return audio, sr

    # For MP3/M4A we decode the whole file and slice — unavoidable with audioread.
    audio, sr, _, _ = decoder.load_audio(path)
    start_f = max(0, int(start_sec * sr))
    end_f   = min(len(audio), int(end_sec * sr))
    return audio[start_f:end_f], sr


def _strip(analysis: dict) -> dict:
    """Drop spectrogram (too large, not needed for region stats panel)."""
    return {k: v for k, v in analysis.items() if k != "spectrogram"}
