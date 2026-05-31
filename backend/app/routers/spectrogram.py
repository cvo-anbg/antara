"""GET /api/spectrogram/{track_id} — STFT magnitude for canvas rendering."""

from fastapi import APIRouter, HTTPException

from app import cache
from app.models import SpectrogramResponse

router = APIRouter()


@router.get("/spectrogram/{track_id}")
async def spectrogram(track_id: str):
    track_data = cache.load_track(track_id)
    if track_data is None:
        raise HTTPException(404, f"Track '{track_id}' not found")

    spec = track_data.get("analysis", {}).get("spectrogram")
    if spec is None:
        raise HTTPException(
            409,
            "Spectrogram data not available. This track may have been uploaded "
            "before spectrogram caching was added — re-upload to regenerate.",
        )

    return SpectrogramResponse(
        track_id=track_id,
        freqs=spec["freqs"],
        times=spec["times"],
        magnitudes_db=spec["magnitudes_db"],
    )
