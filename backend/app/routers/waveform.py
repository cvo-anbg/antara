"""GET /api/waveform/{track_id}?points=N — downsampled peak/RMS envelope."""

from fastapi import APIRouter, HTTPException, Query

from app import cache, decoder, metrics
from app.models import WaveformResponse

router = APIRouter()


@router.get("/waveform/{track_id}")
async def waveform(track_id: str, points: int = Query(default=1000, ge=100, le=10000)):
    track_data = cache.load_track(track_id)
    if track_data is None:
        raise HTTPException(404, f"Track '{track_id}' not found")

    # Check if waveform is already cached at this resolution
    cache_key = f"waveform_{points}"
    if cache_key in track_data.get("_waveforms", {}):
        wf = track_data["_waveforms"][cache_key]
        info = track_data["info"]
        return WaveformResponse(
            track_id=track_id,
            points=wf["points"],
            duration=info["duration"],
            sample_rate=info["sample_rate"],
            min=wf["min"],
            max=wf["max"],
            rms=wf["rms"],
            times=wf["times"],
        )

    # Need to reload audio to compute envelope
    audio_path = cache.get_upload_path(track_id)
    if audio_path is None:
        raise HTTPException(409, "Audio file unavailable. Re-upload to regenerate.")

    audio, sr, _, _ = decoder.load_audio(audio_path)
    info = track_data["info"]

    wf = metrics.compute_waveform_envelope(audio, sr, points)

    # Cache the result
    if "_waveforms" not in track_data:
        track_data["_waveforms"] = {}
    track_data["_waveforms"][cache_key] = wf
    cache.save_track(track_id, track_data)

    return WaveformResponse(
        track_id=track_id,
        points=wf["points"],
        duration=info["duration"],
        sample_rate=sr,
        min=wf["min"],
        max=wf["max"],
        rms=wf["rms"],
        times=wf["times"],
    )
