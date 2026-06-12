# Architecture

## Overview

```
Browser (React + Vite :5173)
    │  /api/* (proxied)
    ▼
FastAPI + uvicorn (:8000)
    │
    ├── /api/upload        POST  — decode, hash, run analysis, cache
    ├── /api/analyze       POST  — alignment + delta + comparison JSON
    ├── /api/region-analyze POST — same comparison on a time-bounded slice
    ├── /api/segments/:id  GET   — auto-detected song sections for drill-down
    ├── /api/waveform/:id  GET   — downsampled envelope (min/max/rms)
    ├── /api/spectrogram/:id GET  — STFT magnitude matrix for canvas
    ├── /api/audio/:id     GET   — stream original file (range requests)
    └── /api/chat          POST  — rule-based Q&A over the comparison JSON
```

## Analysis pipeline

### 1. Upload & decoding (`app/decoder.py`)

Files are decoded to float32 arrays with shape `(n_samples, n_channels)` normalised to `[-1, 1]`.

- **WAV / FLAC / AIFF** — decoded natively by `soundfile` (libsndfile).
- **MP3 / M4A / AAC** — decoded via `audioread`, which shells out to `ffmpeg`.

A SHA-256 content hash (first 16 hex chars) is computed from the raw file bytes.  This is the `track_id`; re-uploading the same file is always a cache hit.

### 2. Per-track analysis (`app/metrics.py`)

All numbers come from this module. The frontend never computes audio metrics.

| Metric | Method |
|---|---|
| Integrated LUFS | `pyloudnorm.Meter.integrated_loudness()` — ITU-R BS.1770-4 |
| LRA | `pyloudnorm.Meter.loudness_range()` — EBU R128 |
| Max momentary LUFS | Fast K-weighted sliding window (400 ms / 100 ms hop) via manual SOS filter |
| Max short-term LUFS | pyloudnorm called on 3 s windows (1 s hop) |
| Sample peak | `max(|audio|)` → dBFS |
| True peak | 4× polyphase oversampling (`scipy.signal.resample_poly`) then max → dBTP |
| Crest factor | 20·log10(peak/RMS) |
| PSR | sample\_peak\_dBFS − integrated\_LUFS (mastering headroom proxy) |
| Average spectrum | Mean of `|STFT|²` across time → log-binned to 256 frequency bins |
| Spectral centroid/rolloff/flatness | librosa feature extractors |
| Spectrogram | librosa STFT → dB → downsampled to 256 freq × ≤1000 time bins |
| Phase correlation | Pearson r(L, R): +1 = mono, −1 = out-of-phase |
| Clipping | Sample count ≥ 0.9999 |
| DC offset | `mean(audio)` per channel |
| Noise floor | 10th-percentile short-term RMS (0.5 s blocks) → dBFS |

### 3. Cross-correlation alignment (`app/alignment.py`)

Both tracks are downsampled to ~4 kHz and mono-mixed, then zero-mean normalised.
A full cross-correlation (`scipy.signal.fftconvolve`) is computed and searched over a ±10 s window.
The peak lag is converted back to original-sample-rate samples and milliseconds.

Confidence is the peak correlation value divided by `RMS × sqrt(n)` — a loose SNR measure.
The alignment is reported but applying it to playback is the user's choice (manual nudge in the transport).

### 4. Comparison & deltas (`app/routers/analyze.py`)

For every scalar metric: `Δ = POST − PRE`.
For the frequency-response difference curve: `Δ_db[f] = avg_spectrum_post[f] − avg_spectrum_pre[f]`.
Both share the same log-frequency bin grid, so the subtraction is element-wise.

### 5. Caching (`app/cache.py`)

| Store | Key | Contents |
|---|---|---|
| `backend/.cache/tracks/<id>.json` | SHA-256 hash | Per-track analysis + spectrogram |
| `backend/.cache/comparisons/<preId>__<postId>.json` | Hash pair | Comparison result |
| `backend/.cache/comparisons/<preId>__region_<start>_<end>__<postId>.json` | Hash pair + region bounds | Region comparison result |
| `backend/.uploads/<id>.<ext>` | SHA-256 hash | Original file (needed for alignment and re-analysis) |

Cache is checked before any computation; cache hits are instant.

### 6. Region analysis (`app/routers/region.py`)

`POST /api/region-analyze` re-runs the full per-track analysis and comparison on a
time-bounded slice (`pre_id`, `post_id`, `start_sec`, `end_sec`), triggered when the
user drag-selects a region on the waveform. Regions must be ≥ 0.5 s.

- For WAV/FLAC/AIFF the slice is read directly from disk via `soundfile`'s seek
  support — O(slice), not O(file). MP3/M4A must be fully decoded first.
- Spectrograms are skipped (`compute_spectrogram=False`) — the stats panel doesn't need them.
- Cache keys round start/end to 100 ms so slight drag jitter still hits the cache.
- The response matches the comparison JSON contract plus a `region` field with the bounds.

### 7. Structural segmentation (`app/routers/segments.py`)

`GET /api/segments/{track_id}` splits a track into 2–8 musically coherent sections
by agglomerative clustering of MFCC frames (one section per ~25 s, clamped). Each
section carries its RMS level plus a `loudest`/`quietest` tag. Results are cached
inside the track's cache JSON.

The frontend renders these as a clickable strip under the waveforms
(`SegmentStrip`); selecting a section sets it as the active region, which drives
the normal region-analyze flow — so every section gets the full comparison
treatment without any new analysis code.

After segments load, the frontend also walks them sequentially in the background,
calling `/api/region-analyze` per section to build one-line verdicts
(`insights.ts::buildSectionVerdict`) shown as cards in the stats panel's Simple
view. Because those calls are cached server-side, clicking a section later is
instant.

### 8. Track chat (`app/routers/chat.py`)

`POST /api/chat` answers natural-language questions about the comparison. It is
**rule-based keyword matching, not an LLM**: the frontend sends the question plus the
full `ComparisonResult` JSON, and the endpoint routes on keywords (brightness, bass,
dynamics, loudness, peaks, frequency, recommendations) to template answers computed
from the measured data. Stateless — no conversation history is kept.

Band summaries come from `_band_changes()`, which averages the spectrum-diff curve over
six named bands (sub bass → air) and reports bands shifted by ≥ 0.75 dB. The same band
table is duplicated in `frontend/src/insights.ts` (`TONE_BANDS`); keep them in sync.

## JSON contract (comparison endpoint)

```jsonc
{
  "alignment": {
    "offset_samples": 0,       // at original SR
    "offset_ms": 0.0,
    "confidence": 0.95
  },
  "pre":  { /* TrackAnalysis — see below */ },
  "post": { /* TrackAnalysis — see below */ },
  "delta": {
    "integrated_lufs":    -3.1,   // POST − PRE
    "lra":                -1.2,
    // ... all scalar metrics
  },
  "spectrum_diff": {
    "freqs": [20.0, 22.4, ...],   // Hz, log-spaced
    "db":    [-0.3, 0.1, ...]     // POST − PRE per bin
  }
}
```

### TrackAnalysis shape

```jsonc
{
  "track_id": "<sha256 prefix>",
  "metrics": {
    "loudness": { "integrated_lufs": -14.2, "lra": 6.1, "max_momentary_lufs": -9.1, "max_short_term_lufs": -11.3 },
    "peaks":    { "sample_peak_dbfs": -0.3, "true_peak_dbtp": 0.1 },
    "dynamics": { "crest_factor_db": 13.9, "psr_db": 13.9, "rms_dbfs": -18.1 },
    "spectral": { "centroid_hz": 2340, "rolloff_hz": 8900, "flatness": 0.0042 },
    "quality":  { "clip_count": 0, "dc_offset_l": 0.0001, "dc_offset_r": -0.0002, "phase_correlation": 0.93, "noise_floor_dbfs": -72.1 }
  },
  "spectrum":       { "freqs": [...], "db": [...] },
  "loudness_series": { "t": [...], "lufs": [...] }
}
```

## Frontend architecture

```
App
├── Transport          — playback controls, A/B toggle, seek bar, alignment badge
├── WaveformPanel      — custom canvas waveforms (shared time axis, region drag)
│   ├── SpectrogramCanvas (PRE)
│   └── SpectrogramCanvas (POST)
├── SegmentStrip       — clickable auto-detected sections → region drill-down
├── StatsPanel         — verdict-first; Simple/Charts view toggle
│   ├── Simple view    — plain-language verdict, beginner cards,
│   │                    per-section verdict cards, TrackChat
│   └── Charts view
│       ├── SpectrumChart  — recharts frequency-response overlay + Δ curve
│       ├── LoudnessChart  — recharts short-term LUFS over time
│       └── MetricsTable   — PRE | POST | Δ table with colour-coded deltas
├── TrackChat          — Q&A panel backed by /api/chat
└── UploadZone (×2)   — drag-drop file upload with progress

useAudioEngine (hook)  — Web Audio API: two MediaElementSourceNodes → GainNodes → destination
useAppStore (zustand)  — global state: tracks, comparison, playback, region
```

### Gapless A/B switching

Two `<audio>` elements play in lock-step.  Each routes through a `GainNode`.  Switching A/B sets the inactive gain to `0` and the active gain to `1` (with an optional loudness-match offset applied).  The switch is sample-accurate and produces no audible click.

### Loudness-matched listening

When enabled: `gain_post = 10^(−Δ_LUFS / 20)` where `Δ_LUFS = post_lufs − pre_lufs`.  Applied only when POST is active.  Never persisted.  Prominently labelled in the UI.

## Extension points

- **In-app DSP** — add processing endpoints to `app/routers/` and pipe through a new comparison mode; read-only invariant is at the API level only.
- **Export** — add a `/api/export/report` endpoint that renders the comparison JSON to PDF/CSV.
