"""
Per-track analysis: loudness (BS.1770), true-peak, dynamics, spectral, stereo quality.

Audio convention throughout: np.ndarray shape (n_samples, n_channels), float32, [-1, 1].
"""

from typing import Tuple
import warnings

import numpy as np
import scipy.signal as sig
import librosa
import pyloudnorm as pyln

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _mono(audio: np.ndarray) -> np.ndarray:
    """Mean-mix to mono; always returns 1-D array."""
    if audio.ndim == 1:
        return audio.astype(np.float32)
    return audio.mean(axis=1).astype(np.float32)


def _ensure_2d(audio: np.ndarray) -> np.ndarray:
    """Ensure (n_samples, n_channels) shape."""
    if audio.ndim == 1:
        return audio[:, np.newaxis]
    return audio


# ──────────────────────────────────────────────
# Loudness (ITU-R BS.1770 / EBU R128)
# ──────────────────────────────────────────────

def compute_loudness(audio: np.ndarray, sr: int) -> dict:
    """
    Compute integrated LUFS, LRA, max momentary, max short-term, and a short-term series.

    Integrated LUFS and LRA use pyloudnorm (accurate BS.1770 gating).
    Short-term and momentary series use a fast K-weighted SOS sliding window so
    10-minute files still analyse in seconds rather than minutes.
    """
    audio2d = _ensure_2d(audio)
    meter = pyln.Meter(sr)

    # Integrated & LRA — pyloudnorm, called once on the full signal.
    # pyloudnorm requires ≥0.4 s for integrated and ≥3 s for LRA.
    # For short clips (e.g. region analysis) we fall back gracefully.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            integrated = meter.integrated_loudness(audio2d)
        except ValueError:
            integrated = -70.0
        try:
            lra = meter.loudness_range(audio2d)
        except ValueError:
            lra = float("nan")

    # Pre-filter once; reuse for both short-term series and momentary max.
    sos = _kweight_sos(sr)
    filtered = _kfilter(audio2d, sos)           # (n_samples, n_channels)
    sq_sum = np.sum(filtered ** 2, axis=1)      # BS.1770: sum channels (weights=1 for L/R)
    cs = np.concatenate(([0.0], np.cumsum(sq_sum)))  # prefix-sum for O(1) window means

    # Short-term series: 3 s window, 1 s hop
    st_times, st_lufs = _lufs_series_fast(cs, sr, audio2d.shape[0], window_sec=3.0, hop_sec=1.0)

    # Momentary max: 400 ms window, 100 ms hop
    _, mom_lufs = _lufs_series_fast(cs, sr, audio2d.shape[0], window_sec=0.4, hop_sec=0.1)
    mom_max = float(max(mom_lufs)) if mom_lufs else float(integrated)

    max_short_term = float(max(st_lufs)) if st_lufs else float(integrated)

    return {
        "integrated_lufs": float(integrated),
        "lra": float(lra),
        "max_momentary_lufs": mom_max,
        "max_short_term_lufs": max_short_term,
        "series_t": st_times,
        "series_lufs": st_lufs,
    }


def _kfilter(audio2d: np.ndarray, sos: np.ndarray) -> np.ndarray:
    """Apply K-weighting SOS filter to each channel."""
    out = np.empty_like(audio2d, dtype=np.float64)
    for c in range(audio2d.shape[1]):
        out[:, c] = sig.sosfilt(sos, audio2d[:, c].astype(np.float64))
    return out


def _lufs_series_fast(cs: np.ndarray, sr: int, n_samples: int,
                      window_sec: float, hop_sec: float) -> Tuple[list, list]:
    """
    O(n_frames) short-term/momentary LUFS via cumsum prefix array.

    cs   — cumsum of (sum of squared K-weighted channels), length n_samples+1
    Formula: L = -0.691 + 10·log10(mean_square), where mean_square = (cs[end]-cs[start])/window
    No gating is applied (correct for short-term/momentary per EBU R128).
    """
    window = int(window_sec * sr)
    hop = int(hop_sec * sr)
    if n_samples < window or hop < 1:
        return [], []

    starts = np.arange(0, n_samples - window + 1, hop)
    ends = starts + window
    mean_sq = (cs[ends] - cs[starts]) / window
    # Avoid log(0); floor at -70 LUFS
    lufs_arr = np.where(mean_sq > 1e-10,
                        -0.691 + 10.0 * np.log10(np.maximum(mean_sq, 1e-10)),
                        -70.0)
    lufs_arr = np.clip(lufs_arr, -70.0, 0.0)
    times = ((starts + window / 2) / sr).tolist()
    return times, lufs_arr.tolist()


# _fast_momentary_max is now inlined into compute_loudness via _lufs_series_fast.


def _kweight_sos(sr: int) -> np.ndarray:
    """
    Approximate K-weighting filter as SOS (two biquad stages).

    Stage 1: Pre-filter shelving — boosts high frequencies ~+4 dB.
    Stage 2: RLB high-pass — removes sub-bass.

    Coefficients derived from the analogue prototypes in BS.1770-4 Annex 1
    and bilinear-transformed at the given sample rate.
    """
    # Pre-filter shelving (Annex 1, Table 1)
    Vh, Vb, H0 = 1.53512485958697, 1.69065929318241, 0.73116304807191
    Kp = np.tan(np.pi * 1681.97 / sr)
    a0 = 1 + Kp / Vh + Kp ** 2
    b0 = (1 + Vb * Kp / Vh + Kp ** 2) / a0
    b1 = 2 * (Kp ** 2 - 1) / a0
    b2 = (1 - Vb * Kp / Vh + Kp ** 2) / a0
    a1 = 2 * (Kp ** 2 - 1) / a0
    a2 = (1 - Kp / Vh + Kp ** 2) / a0
    stage1 = [b0, b1, b2, 1.0, a1, a2]

    # RLB high-pass (Annex 1, Table 2)
    Kh = np.tan(np.pi * 38.13547 / sr)
    Q = 0.5003270373253853
    a0h = 1 + Kh / Q + Kh ** 2
    b0h = 1.0 / a0h
    b1h = -2.0 / a0h
    b2h = 1.0 / a0h
    a1h = 2 * (Kh ** 2 - 1) / a0h
    a2h = (1 - Kh / Q + Kh ** 2) / a0h
    stage2 = [b0h, b1h, b2h, 1.0, a1h, a2h]

    return np.array([stage1, stage2], dtype=np.float64)


# ──────────────────────────────────────────────
# Peaks
# ──────────────────────────────────────────────

def compute_peaks(audio: np.ndarray, sr: int) -> dict:
    """Sample peak (dBFS) and 4× oversampled true peak (dBTP)."""
    # Sample peak
    peak_linear = float(np.max(np.abs(audio)))
    sample_peak_dbfs = 20.0 * np.log10(peak_linear) if peak_linear > 0 else -np.inf

    # True peak — 4× oversample with polyphase filter, then find max.
    # Operate on mono mix to keep computation reasonable.
    mono = _mono(audio)
    oversampled = sig.resample_poly(mono, up=4, down=1)
    tp_linear = float(np.max(np.abs(oversampled)))
    true_peak_dbtp = 20.0 * np.log10(tp_linear) if tp_linear > 0 else -np.inf

    return {
        "sample_peak_dbfs": float(sample_peak_dbfs),
        "true_peak_dbtp": float(true_peak_dbtp),
    }


# ──────────────────────────────────────────────
# Dynamics
# ──────────────────────────────────────────────

def compute_dynamics(audio: np.ndarray, integrated_lufs: float, sample_peak_dbfs: float) -> dict:
    """Crest factor, PSR (peak-to-loudness ratio), overall RMS."""
    rms_linear = float(np.sqrt(np.mean(audio ** 2)))
    rms_dbfs = 20.0 * np.log10(rms_linear) if rms_linear > 0 else -np.inf

    peak_linear = float(np.max(np.abs(audio)))
    crest_factor_db = (20.0 * np.log10(peak_linear / rms_linear)
                       if rms_linear > 0 and peak_linear > 0 else np.inf)

    # PSR = sample_peak - integrated_LUFS (a simple mastering headroom proxy)
    psr_db = (sample_peak_dbfs - integrated_lufs
              if np.isfinite(sample_peak_dbfs) and np.isfinite(integrated_lufs) else np.inf)

    return {
        "crest_factor_db": float(crest_factor_db),
        "psr_db": float(psr_db),
        "rms_dbfs": float(rms_dbfs),
    }


# ──────────────────────────────────────────────
# Spectral
# ──────────────────────────────────────────────

N_FFT = 4096
HOP_LENGTH = 1024
N_DISPLAY_FREQ = 256   # log-spaced bins returned for display
N_DISPLAY_TIME = 1000  # max time frames for spectrogram


def compute_spectral(audio: np.ndarray, sr: int) -> dict:
    """Average power spectrum, spectral centroid/rolloff/flatness, STFT for display."""
    mono = _mono(audio)

    # STFT
    stft = librosa.stft(mono, n_fft=N_FFT, hop_length=HOP_LENGTH)
    mag = np.abs(stft)       # (n_freqs, n_frames)
    power = mag ** 2

    freqs_full = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)  # (n_freqs,)

    # Average power spectrum across time → dB
    avg_power = np.mean(power, axis=1)
    avg_db_full = 10.0 * np.log10(avg_power + 1e-12)

    # Log-bin into N_DISPLAY_FREQ bins from 20 Hz to Nyquist
    spectrum_freqs, spectrum_db = _logbin_spectrum(freqs_full, avg_db_full, N_DISPLAY_FREQ, sr)

    # Scalar spectral features (operate on magnitude spectrogram)
    centroid = float(np.mean(librosa.feature.spectral_centroid(S=mag, sr=sr)[0]))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(S=mag, sr=sr)[0]))
    flatness = float(np.mean(librosa.feature.spectral_flatness(S=mag)[0]))

    return {
        "spectrum_freqs": spectrum_freqs,
        "spectrum_db": spectrum_db,
        "centroid_hz": centroid,
        "rolloff_hz": rolloff,
        "flatness": flatness,
        # Full STFT for spectrogram endpoint — stored separately
        "stft_mag": mag,
        "stft_freqs": freqs_full,
    }


def _logbin_spectrum(freqs: np.ndarray, db: np.ndarray,
                     n_bins: int, sr: int) -> Tuple[list, list]:
    """Bin a linear-frequency spectrum into n_bins log-spaced output bins."""
    f_min, f_max = 20.0, sr / 2.0
    log_edges = np.logspace(np.log10(f_min), np.log10(f_max), n_bins + 1)
    out_freqs, out_db = [], []

    for i in range(n_bins):
        mask = (freqs >= log_edges[i]) & (freqs < log_edges[i + 1])
        if mask.any():
            # Geometric mean frequency for this bin
            bin_f = float(np.sqrt(log_edges[i] * log_edges[i + 1]))
            # Energy-average in dB: convert to linear, mean, back to dB
            linear = 10.0 ** (db[mask] / 10.0)
            bin_db = float(10.0 * np.log10(np.mean(linear) + 1e-12))
            out_freqs.append(bin_f)
            out_db.append(bin_db)

    return out_freqs, out_db


def build_spectrogram_display(stft_mag: np.ndarray, freqs: np.ndarray,
                               sr: int, n_fft: int, hop_length: int) -> dict:
    """
    Down-sample STFT magnitude to a display-friendly size and convert to dB.
    Returns {freqs, times, magnitudes_db} suitable for the spectrogram endpoint.
    """
    n_freq_orig, n_time_orig = stft_mag.shape

    # Time-downsample: collapse to ≤ N_DISPLAY_TIME frames
    t_stride = max(1, n_time_orig // N_DISPLAY_TIME)
    mag_ds = stft_mag[:, ::t_stride]
    n_time_ds = mag_ds.shape[1]

    # Frequency-downsample: log-spaced bins
    f_min, f_max = 20.0, sr / 2.0
    log_edges = np.logspace(np.log10(f_min), np.log10(f_max), N_DISPLAY_FREQ + 1)
    out_mags = np.full((N_DISPLAY_FREQ, n_time_ds), -80.0)
    out_freqs = []

    for i in range(N_DISPLAY_FREQ):
        mask = (freqs >= log_edges[i]) & (freqs < log_edges[i + 1])
        if mask.any():
            bin_mag = mag_ds[mask, :].mean(axis=0)
            out_mags[i, :] = 20.0 * np.log10(bin_mag + 1e-12)
        out_freqs.append(float(np.sqrt(log_edges[i] * log_edges[i + 1])))

    times_full = librosa.frames_to_time(
        np.arange(n_time_orig), sr=sr, hop_length=hop_length, n_fft=n_fft
    )
    out_times = [float(times_full[min(i * t_stride, n_time_orig - 1)])
                 for i in range(n_time_ds)]

    return {
        "freqs": out_freqs,
        "times": out_times,
        "magnitudes_db": out_mags.tolist(),
    }


# ──────────────────────────────────────────────
# Stereo / quality checks
# ──────────────────────────────────────────────

def compute_quality(audio: np.ndarray, sr: int) -> dict:
    """Clipping, DC offset, phase correlation, noise floor estimate."""
    audio2d = _ensure_2d(audio)
    n_channels = audio2d.shape[1]

    # Clipping: samples at or above full scale
    clip_count = int(np.sum(np.abs(audio2d) >= 0.9999))

    # DC offset per channel
    dc_l = float(np.mean(audio2d[:, 0]))
    dc_r = float(np.mean(audio2d[:, 1])) if n_channels > 1 else None

    # Inter-channel phase correlation (stereo only) — Pearson r(L, R)
    # Range [-1, +1]: +1 = mono, 0 = uncorrelated, -1 = out-of-phase (bad)
    phase_corr = None
    if n_channels > 1:
        L, R = audio2d[:, 0], audio2d[:, 1]
        std_L, std_R = np.std(L), np.std(R)
        if std_L > 0 and std_R > 0:
            phase_corr = float(np.mean((L - L.mean()) * (R - R.mean())) / (std_L * std_R))

    # Noise floor: 10th-percentile short-term RMS of the mono mix
    mono = _mono(audio)
    noise_floor_dbfs = _estimate_noise_floor(mono, sr)

    return {
        "clip_count": clip_count,
        "dc_offset_l": dc_l,
        "dc_offset_r": dc_r,
        "phase_correlation": phase_corr,
        "noise_floor_dbfs": noise_floor_dbfs,
    }


def _estimate_noise_floor(mono: np.ndarray, sr: int, window_sec: float = 0.5) -> float:
    """Estimate noise floor as the 10th-percentile of short-term RMS blocks."""
    window = int(window_sec * sr)
    n_blocks = len(mono) // window
    if n_blocks < 3:
        rms = float(np.sqrt(np.mean(mono ** 2)))
        return 20.0 * np.log10(rms) if rms > 0 else -90.0

    rms_vals = [
        np.sqrt(np.mean(mono[i * window : (i + 1) * window] ** 2))
        for i in range(n_blocks)
    ]
    p10 = float(np.percentile(rms_vals, 10))
    return 20.0 * np.log10(p10) if p10 > 0 else -90.0


# ──────────────────────────────────────────────
# Waveform envelope (for /api/waveform endpoint)
# ──────────────────────────────────────────────

def compute_waveform_envelope(audio: np.ndarray, sr: int, n_points: int) -> dict:
    """Downsample to n_points buckets, returning min/max/rms per bucket."""
    mono = _mono(audio)
    n_samples = len(mono)
    bucket = max(1, n_samples // n_points)
    actual_points = n_samples // bucket

    mins, maxs, rmss, times = [], [], [], []
    for i in range(actual_points):
        chunk = mono[i * bucket : (i + 1) * bucket]
        mins.append(float(np.min(chunk)))
        maxs.append(float(np.max(chunk)))
        rmss.append(float(np.sqrt(np.mean(chunk ** 2))))
        times.append(float((i * bucket + bucket / 2) / sr))

    return {
        "points": actual_points,
        "min": mins,
        "max": maxs,
        "rms": rmss,
        "times": times,
    }


# ──────────────────────────────────────────────
# Full per-track analysis (runs once on upload)
# ──────────────────────────────────────────────

def analyze_track(audio: np.ndarray, sr: int, compute_spectrogram: bool = True) -> dict:
    """
    Run all per-track metrics and return a serializable dict.

    compute_spectrogram=False skips the STFT display matrix — used for region
    analysis where the spectrogram is not needed and speed matters.
    """
    loudness = compute_loudness(audio, sr)
    peaks = compute_peaks(audio, sr)
    dynamics = compute_dynamics(audio, loudness["integrated_lufs"], peaks["sample_peak_dbfs"])
    spectral = compute_spectral(audio, sr)
    quality = compute_quality(audio, sr)

    spec_display = None
    if compute_spectrogram:
        spec_display = build_spectrogram_display(
            spectral["stft_mag"], spectral["stft_freqs"], sr, N_FFT, HOP_LENGTH
        )

    return {
        "metrics": {
            "loudness": {
                "integrated_lufs": loudness["integrated_lufs"],
                "lra": loudness["lra"],
                "max_momentary_lufs": loudness["max_momentary_lufs"],
                "max_short_term_lufs": loudness["max_short_term_lufs"],
            },
            "peaks": peaks,
            "dynamics": dynamics,
            "spectral": {
                "centroid_hz": spectral["centroid_hz"],
                "rolloff_hz": spectral["rolloff_hz"],
                "flatness": spectral["flatness"],
            },
            "quality": quality,
        },
        "spectrum": {
            "freqs": spectral["spectrum_freqs"],
            "db": spectral["spectrum_db"],
        },
        "loudness_series": {
            "t": loudness["series_t"],
            "lufs": loudness["series_lufs"],
        },
        "spectrogram": spec_display,
    }
