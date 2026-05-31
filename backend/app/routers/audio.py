"""
GET /api/audio/{track_id} — stream the decoded audio file with range-request support.

Streams the original uploaded file so wavesurfer.js / Web Audio can play it
without re-encoding.  Range requests are supported so browsers can seek efficiently.
"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app import cache

router = APIRouter()

# MIME types by extension
MIME = {
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".mp4": "audio/mp4",
}

CHUNK = 64 * 1024  # 64 KB streaming chunks


@router.get("/audio/{track_id}")
async def stream_audio(track_id: str, request: Request):
    track_data = cache.load_track(track_id)
    if track_data is None:
        raise HTTPException(404, f"Track '{track_id}' not found")

    audio_path = cache.get_upload_path(track_id)
    if audio_path is None:
        raise HTTPException(
            404, "Audio file not found on disk. Re-upload the file to restore it."
        )

    mime = MIME.get(audio_path.suffix.lower(), "application/octet-stream")
    file_size = audio_path.stat().st_size

    range_header = request.headers.get("range")
    if range_header:
        return _range_response(audio_path, file_size, mime, range_header)

    # No range header — stream the whole file
    return StreamingResponse(
        _file_generator(audio_path),
        media_type=mime,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


def _range_response(path: Path, file_size: int, mime: str, range_header: str):
    """Parse Range header and return a 206 Partial Content response."""
    try:
        unit, ranges = range_header.split("=", 1)
        if unit.strip() != "bytes":
            raise ValueError("non-bytes range")
        first_range = ranges.split(",")[0].strip()
        start_str, end_str = first_range.split("-", 1)
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        end = min(end, file_size - 1)
    except Exception:
        raise HTTPException(416, "Invalid Range header")

    if start > end or start >= file_size:
        raise HTTPException(416, "Range Not Satisfiable")

    length = end - start + 1

    return StreamingResponse(
        _file_generator(path, start, end),
        status_code=206,
        media_type=mime,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(length),
        },
    )


def _file_generator(path: Path, start: int = 0, end: "Optional[int]" = None):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = (end - start + 1) if end is not None else None
        while True:
            read_size = CHUNK if remaining is None else min(CHUNK, remaining)
            chunk = f.read(read_size)
            if not chunk:
                break
            yield chunk
            if remaining is not None:
                remaining -= len(chunk)
                if remaining <= 0:
                    break
