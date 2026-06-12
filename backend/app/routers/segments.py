"""
GET /api/segments/{track_id} — structural segmentation for section drill-down.

Splits the track into musically coherent sections by agglomerative clustering
of MFCC frames (librosa). The frontend renders these as a clickable strip;
selecting one drives the existing region-analyze flow, so each section gets
the full comparison treatment (deltas, spectrum diff, plain-language summary).

Results are cached inside the track's cache JSON, so re-requests are instant.
"""

import librosa
import numpy as np
from fastapi import APIRouter, HTTPException

from app import cache, decoder
from app.utils import sanitize

router = APIRouter()

HOP = 2048
TARGET_SECTION_SEC = 25  # aim for one section per ~25 s of audio


@router.get("/segments/{track_id}")
async def segments(track_id: str, max_segments: int = 8):
    track = cache.load_track(track_id)
    if track is None:
        raise HTTPException(404, f"Track '{track_id}' not found")

    cached = track.get("segments")
    if cached and cached.get("max_segments") == max_segments:
        return cached["data"]

    path = cache.get_upload_path(track_id)
    if path is None:
        raise HTTPException(409, "Audio file unavailable on disk. Re-upload to restore.")

    try:
        audio, sr, _, _ = decoder.load_audio(path)
    except Exception as e:
        raise HTTPException(422, f"Failed to decode audio: {e}")

    mono = audio.mean(axis=1)
    duration = len(mono) / sr

    k = int(np.clip(round(duration / TARGET_SECTION_SEC), 2, max_segments))
    mfcc = librosa.feature.mfcc(y=mono, sr=sr, n_mfcc=13, hop_length=HOP)

    if mfcc.shape[1] < 2 * k:
        boundary_frames = np.array([0])
    else:
        boundary_frames = librosa.segment.agglomerative(mfcc, k)

    times = librosa.frames_to_time(boundary_frames, sr=sr, hop_length=HOP).tolist()
    times.append(duration)

    segs = []
    for i in range(len(times) - 1):
        start, end = times[i], times[i + 1]
        if end - start < 0.5:  # region-analyze rejects regions under 0.5 s
            continue
        sl = mono[int(start * sr):int(end * sr)]
        rms = float(np.sqrt(np.mean(sl ** 2))) if len(sl) else 0.0
        rms_db = 20 * float(np.log10(rms)) if rms > 0 else float("-inf")
        segs.append({
            "index": len(segs),
            "start": round(start, 2),
            "end": round(end, 2),
            "rms_db": rms_db,
            "tag": None,
        })

    finite = [s for s in segs if np.isfinite(s["rms_db"])]
    if len(finite) >= 2:
        loudest = max(finite, key=lambda s: s["rms_db"])
        quietest = min(finite, key=lambda s: s["rms_db"])
        loudest["tag"] = "loudest"
        if quietest is not loudest:
            quietest["tag"] = "quietest"

    data = sanitize({"track_id": track_id, "duration": duration, "segments": segs})
    track["segments"] = {"max_segments": max_segments, "data": data}
    cache.save_track(track_id, track)
    return data
