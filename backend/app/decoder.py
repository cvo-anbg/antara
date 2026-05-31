"""Audio decoding: soundfile for WAV/FLAC/AIFF, audioread fallback for MP3/M4A."""

import hashlib
import tempfile
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import soundfile as sf

SUPPORTED_NATIVE = {".wav", ".flac", ".aiff", ".aif"}
SUPPORTED_FFMPEG = {".mp3", ".m4a", ".aac", ".mp4"}
SUPPORTED_ALL = SUPPORTED_NATIVE | SUPPORTED_FFMPEG


def compute_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def load_audio(path: Path) -> Tuple[np.ndarray, int, int, str]:
    """
    Load audio file and return (audio, sample_rate, n_channels, format).
    audio is always shape (n_samples, n_channels), float32, normalized to [-1, 1].
    """
    suffix = path.suffix.lower()

    if suffix in SUPPORTED_NATIVE:
        audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
        fmt = suffix.lstrip(".")
        n_channels = audio.shape[1]
        return audio, sr, n_channels, fmt

    if suffix in SUPPORTED_FFMPEG:
        return _load_via_audioread(path)

    raise ValueError(f"Unsupported format: {suffix}. Supported: {', '.join(sorted(SUPPORTED_ALL))}")


def _load_via_audioread(path: Path) -> Tuple[np.ndarray, int, int, str]:
    """Decode MP3/M4A via audioread (requires ffmpeg on PATH)."""
    try:
        import audioread
    except ImportError:
        raise RuntimeError("audioread is not installed. Run: pip install audioread")

    try:
        with audioread.audio_open(str(path)) as f:
            sr = f.samplerate
            n_channels = f.channels
            fmt = path.suffix.lstrip(".")

            chunks = []
            for block in f:
                raw = np.frombuffer(block, dtype=np.int16).astype(np.float32)
                chunks.append(raw)

            if not chunks:
                raise ValueError("No audio data decoded from file")

            audio_flat = np.concatenate(chunks)
            audio_flat /= 32768.0  # normalize int16 to [-1, 1]

            # Reshape to (n_samples, n_channels)
            n_samples = len(audio_flat) // n_channels
            audio = audio_flat[: n_samples * n_channels].reshape(n_samples, n_channels)

            return audio.astype(np.float32), sr, n_channels, fmt

    except Exception as e:
        raise RuntimeError(
            f"Failed to decode {path.name} via audioread/ffmpeg: {e}. "
            "Ensure ffmpeg is installed and on PATH."
        )


def audio_info(audio: np.ndarray, sr: int) -> dict:
    return {
        "duration": float(audio.shape[0] / sr),
        "sample_rate": sr,
        "channels": audio.shape[1],
        "n_samples": audio.shape[0],
    }
