"""
Cross-correlation alignment between PRE and POST tracks.

We downsample to ~4 kHz before correlating so the operation is fast even on
long files.  The search window is ±10 seconds, which covers any realistic
start-trim or fade-in difference between an unmastered and mastered version.
"""

import numpy as np
import scipy.signal as sig


ANALYSIS_SR = 4000       # target sample rate for alignment
MAX_OFFSET_SEC = 10.0    # search window ±10 s


def compute_alignment(pre_audio: np.ndarray, post_audio: np.ndarray, sr: int) -> dict:
    """
    Estimate the time offset of POST relative to PRE via normalised cross-correlation.

    A positive offset means POST starts later than PRE (i.e. POST is ahead of PRE
    by `offset_ms` ms) — apply by trimming the start of POST or padding the start
    of PRE before overlaying.

    Returns:
        offset_samples: int  — offset at the *original* sample rate
        offset_ms:      float
        confidence:     float — normalised peak correlation ∈ [0, 1]
    """
    pre_mono = _to_mono(pre_audio)
    post_mono = _to_mono(post_audio)

    # Downsample for speed
    ds = max(1, sr // ANALYSIS_SR)
    pre_ds = pre_mono[::ds].astype(np.float64)
    post_ds = post_mono[::ds].astype(np.float64)

    # Normalise to unit variance so amplitude differences don't dominate
    pre_ds = _normalise(pre_ds)
    post_ds = _normalise(post_ds)

    # Limit arrays to a manageable length (first 3 minutes is plenty)
    max_samples = ANALYSIS_SR * 180
    pre_ds = pre_ds[:max_samples]
    post_ds = post_ds[:max_samples]

    # Full cross-correlation: corr[k] = sum(post[n] * pre[n - k])
    corr = sig.fftconvolve(post_ds, pre_ds[::-1], mode="full")
    # corr is indexed from -(len(pre)-1) to +(len(post)-1)
    # The lag at index i corresponds to lag = i - (len(pre_ds) - 1)
    center = len(pre_ds) - 1

    # Restrict search to ±MAX_OFFSET_SEC
    max_lag = int(MAX_OFFSET_SEC * ANALYSIS_SR)
    lo = max(0, center - max_lag)
    hi = min(len(corr), center + max_lag + 1)
    search = corr[lo:hi]

    best_idx = int(np.argmax(np.abs(search)))
    lag_ds = best_idx - (center - lo)          # lag in downsampled domain
    lag_original = lag_ds * ds                 # back to original sample rate

    # Confidence: peak / RMS of the correlation trace
    peak = float(np.abs(search[best_idx]))
    rms_corr = float(np.sqrt(np.mean(search ** 2))) + 1e-12
    confidence = float(np.clip(peak / (rms_corr * np.sqrt(len(pre_ds))), 0.0, 1.0))

    return {
        "offset_samples": int(lag_original),
        "offset_ms": float(lag_original / sr * 1000.0),
        "confidence": confidence,
    }


def apply_alignment(pre_audio: np.ndarray, post_audio: np.ndarray,
                    offset_samples: int) -> "tuple[np.ndarray, np.ndarray]":
    """
    Trim/pad PRE and POST so they are aligned for sample-level comparison.

    If offset_samples > 0: POST starts later → trim POST by `offset_samples`.
    If offset_samples < 0: PRE starts later → trim PRE by `|offset_samples|`.

    The shorter signal is zero-padded at the end to equalise lengths.
    """
    if offset_samples > 0:
        post_audio = post_audio[offset_samples:]
    elif offset_samples < 0:
        pre_audio = pre_audio[-offset_samples:]

    # Equalise lengths
    n = min(len(pre_audio), len(post_audio))
    return pre_audio[:n], post_audio[:n]


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _to_mono(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 1:
        return audio.astype(np.float64)
    return audio.mean(axis=1).astype(np.float64)


def _normalise(x: np.ndarray) -> np.ndarray:
    std = np.std(x)
    return x / (std + 1e-12)
