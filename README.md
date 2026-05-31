# Antara — Audio Pre/Post Comparison Tool

Local, read-only A/B comparison for unmastered vs mastered audio. Upload two files, get synchronised waveforms, spectrograms, frequency-response overlay + difference curve, and objective loudness/dynamics statistics — all computed by the Python backend.

## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ | Frontend build |
| npm | 9+ | Frontend deps |
| ffmpeg | any recent | MP3/M4A decoding (optional) |

On macOS:

```bash
brew install python@3.11 node ffmpeg
```

## Install

```bash
make install
```

Or manually:

```bash
cd backend && pip install -r requirements.txt
cd frontend && npm install
```

## Run

```bash
make dev
```

This starts:
- Backend at **http://localhost:8000** (FastAPI / uvicorn, hot-reload)
- Frontend at **http://localhost:5173** (Vite dev server, proxied to backend)

Open **http://localhost:5173** in your browser.

## Usage

1. Drop (or click to browse) your **PRE** file into the left zone.
2. Drop your **POST** file into the right zone.
3. Analysis runs automatically. All metrics arrive from the backend.
4. Use **PRE / POST** buttons (or `A` / `B` keys) to switch listening instantly at the same playhead position.
5. Enable **≈ LUFS** to loudness-match playback gain so you hear tonal differences, not level differences.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Nudge ±0.5 s |
| `Shift ←` / `Shift →` | Nudge ±5 s |
| `A` | Switch to PRE |
| `B` | Switch to POST |
| `L` | Toggle loop (region must be selected) |

## Supported formats

Native (libsndfile): **WAV**, **FLAC**, **AIFF**  
Via ffmpeg fallback: **MP3**, **M4A / AAC**

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the analysis pipeline, JSON contract, and extension points.
