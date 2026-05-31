"""POST /api/upload — receive file, decode, hash, run per-track analysis, cache."""

import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app import cache, decoder, metrics
from app.models import UploadResponse
from app.utils import sanitize

router = APIRouter()

VALID_ROLES = {"pre", "post"}


@router.post("/upload", response_model=UploadResponse)
async def upload(
    file: UploadFile = File(...),
    role: str = Form(...),
):
    if role not in VALID_ROLES:
        raise HTTPException(400, f"role must be 'pre' or 'post', got '{role}'")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in decoder.SUPPORTED_ALL:
        raise HTTPException(
            415,
            f"Unsupported format '{suffix}'. Accepted: "
            + ", ".join(sorted(decoder.SUPPORTED_ALL)),
        )

    # Read file bytes and compute content hash
    raw = await file.read()
    track_id = decoder.compute_hash(raw)

    # Check if we already have analysis for this hash
    cached_analysis = cache.load_track(track_id)
    if cached_analysis is not None:
        info = cached_analysis["info"]
        return UploadResponse(
            track_id=track_id,
            role=role,
            filename=file.filename or "",
            duration=info["duration"],
            sample_rate=info["sample_rate"],
            channels=info["channels"],
            format=info["format"],
            cached=True,
        )

    # Write to temp upload dir
    cache.ensure_dirs()
    upload_path = cache.UPLOADS_DIR / f"{track_id}{suffix}"
    upload_path.write_bytes(raw)

    # Decode
    try:
        audio, sr, n_channels, fmt = decoder.load_audio(upload_path)
    except Exception as e:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(422, f"Failed to decode audio: {e}")

    info = {
        "duration": float(audio.shape[0] / sr),
        "sample_rate": sr,
        "channels": n_channels,
        "format": fmt,
        "filename": file.filename or "",
    }

    # Run full per-track analysis
    try:
        analysis = metrics.analyze_track(audio, sr)
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")

    # Persist to cache (sanitize inf/nan before JSON serialization)
    cache.save_track(track_id, sanitize({"info": info, "analysis": analysis}))

    return UploadResponse(
        track_id=track_id,
        role=role,
        filename=file.filename or "",
        duration=info["duration"],
        sample_rate=sr,
        channels=n_channels,
        format=fmt,
        cached=False,
    )
