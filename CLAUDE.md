# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Antara is a local, read-only A/B comparison tool for unmastered (PRE) vs mastered (POST) audio. A Python/FastAPI backend computes all audio analysis; a React/Vite frontend visualizes it and provides gapless A/B playback.

## Commands

```bash
make install     # pip install -r backend/requirements.txt + npm install in frontend/
make dev         # both servers: backend :8000 (uvicorn --reload), frontend :5173 (vite)
make backend     # backend only
make frontend    # frontend only
```

- `make dev` and `make backend` invoke `backend/.venv/bin/uvicorn`, so a virtualenv must exist at `backend/.venv` (note: `make install-backend` runs bare `pip install`, which does not create it — create the venv first or run uvicorn from your own environment).
- Frontend build/type-check: `cd frontend && npm run build` (runs `tsc` then `vite build`). This is the only automated check in the repo — there is no test suite, linter, or CI.
- The Vite dev server proxies `/api/*` to `localhost:8000` (see `frontend/vite.config.ts`), so always access the app via :5173.
- Backend health check: `GET http://localhost:8000/health`.

## Architecture

`ARCHITECTURE.md` documents the analysis pipeline, the comparison JSON contract, and frontend component tree in detail — read it before changing metrics or API shapes. Note it predates two endpoints that exist in code: `/api/region-analyze` and `/api/chat`.

### Backend (`backend/`)

- `main.py` creates the FastAPI app and mounts all routers from `app/routers/` under `/api`.
- Routers: `upload` (decode + hash + analyze + cache), `analyze` (full-track comparison: deltas + spectrum diff), `region` (`/api/region-analyze`, re-runs metrics on a time slice; reads only the needed slice for WAV/FLAC via soundfile seek), `waveform`, `spectrogram`, `audio` (streams original file with range-request support), `chat` (rule-based keyword Q&A over the comparison JSON — **not** an LLM; the frontend sends the full `ComparisonResult` in the request body).
- `app/metrics.py` is the single source of truth for all audio numbers (LUFS via pyloudnorm, true peak via 4× oversampling, spectra via librosa). **The frontend never computes audio metrics** — keep it that way.
- `app/decoder.py`: WAV/FLAC/AIFF decode natively via soundfile; MP3/M4A fall back to audioread (shells out to ffmpeg).
- `app/models.py`: Pydantic models defining the API contract. Mirror any change in `frontend/src/types.ts`.
- `app/cache.py`: disk cache. `track_id` is the first 16 hex chars of the file's SHA-256, so re-uploads are cache hits. Analysis JSON goes to `backend/.cache/`, originals to `backend/.uploads/` (both gitignored). Delete these directories to force recomputation after changing `metrics.py`.
- `app/utils.py::sanitize()`: every JSON response must pass through this — it replaces NaN/Inf (common from silence/log10(0)) with `null`, which the frontend renders as "—". New endpoints returning metric data must call it.
- Delta convention everywhere: `Δ = POST − PRE` (scalars and per-bin spectrum diff alike).

### Frontend (`frontend/src/`)

- `store.ts`: single zustand store (`useAppStore`) holding tracks, comparison results, playback state, region selection, and upload/analysis progress. All cross-component state lives here.
- `api.ts`: the only place that talks to the backend (fetch + XHR for upload progress).
- `types.ts`: TypeScript mirrors of the backend Pydantic models.
- `hooks/useAudioEngine.ts`: Web Audio playback — two `<audio>` elements playing in lock-step, each through a GainNode; A/B switching just swaps gains (0/1), optionally with a loudness-match offset (`gain_post = 10^(−Δ_LUFS / 20)`, applied only when POST is active, never persisted).
- `insights.ts`: plain-language interpretation of comparison data for the UI. Its `TONE_BANDS` table (sub bass → air, with Hz bounds) is duplicated in `backend/app/routers/chat.py::_band_changes` — keep the two in sync if you change band definitions.
- Components: `Transport` (playback/A-B/seek), `WaveformPanel` + `SpectrogramCanvas` (custom canvas, shared time axis, region drag triggers `/api/region-analyze`), `StatsPanel` (`SpectrumChart`/`LoudnessChart` via recharts, `MetricsTable`), `UploadZone`, `TrackChat`.

### Key invariants

- Read-only with respect to the user's audio: the app analyzes and plays files but never modifies them.
- All metrics come from the backend; the frontend only formats and visualizes.
- Region analysis cache keys round start/end to 100 ms (`region.py`) so small drag jitter still hits the cache.
