from typing import Optional
from pydantic import BaseModel


class UploadResponse(BaseModel):
    track_id: str
    role: str
    filename: str
    duration: float
    sample_rate: int
    channels: int
    format: str
    cached: bool


class WaveformResponse(BaseModel):
    track_id: str
    points: int
    duration: float
    sample_rate: int
    # Parallel arrays: one value per bucket
    min: list[float]
    max: list[float]
    rms: list[float]
    times: list[float]


class SpectrogramResponse(BaseModel):
    track_id: str
    freqs: list[float]      # Hz, length = n_freq_bins
    times: list[float]      # seconds, length = n_time_frames
    magnitudes_db: list[list[float]]  # [n_freq_bins][n_time_frames]


class LoudnessMetrics(BaseModel):
    integrated_lufs: float
    lra: float
    max_momentary_lufs: float
    max_short_term_lufs: float


class PeakMetrics(BaseModel):
    sample_peak_dbfs: float
    true_peak_dbtp: float


class DynamicsMetrics(BaseModel):
    crest_factor_db: float
    psr_db: float          # peak-to-loudness ratio (sample peak - integrated LUFS)
    rms_dbfs: float


class SpectralMetrics(BaseModel):
    centroid_hz: float
    rolloff_hz: float
    flatness: float


class QualityMetrics(BaseModel):
    clip_count: int
    dc_offset_l: float
    dc_offset_r: Optional[float]
    phase_correlation: Optional[float]  # None for mono
    noise_floor_dbfs: float


class TrackMetrics(BaseModel):
    loudness: LoudnessMetrics
    peaks: PeakMetrics
    dynamics: DynamicsMetrics
    spectral: SpectralMetrics
    quality: QualityMetrics


class SpectrumData(BaseModel):
    freqs: list[float]
    db: list[float]


class LoudnessSeries(BaseModel):
    t: list[float]
    lufs: list[float]


class AlignmentResult(BaseModel):
    offset_samples: int
    offset_ms: float
    confidence: float


class DeltaMetrics(BaseModel):
    integrated_lufs: float
    lra: float
    max_momentary_lufs: float
    max_short_term_lufs: float
    sample_peak_dbfs: float
    true_peak_dbtp: float
    crest_factor_db: float
    psr_db: float
    rms_dbfs: float
    centroid_hz: float
    rolloff_hz: float
    flatness: float
    clip_count: int
    dc_offset_l: float
    dc_offset_r: Optional[float]
    phase_correlation: Optional[float]
    noise_floor_dbfs: float


class SpectrumDiff(BaseModel):
    freqs: list[float]
    db: list[float]


class TrackAnalysis(BaseModel):
    track_id: str
    metrics: TrackMetrics
    spectrum: SpectrumData
    loudness_series: LoudnessSeries


class ComparisonResult(BaseModel):
    alignment: AlignmentResult
    pre: TrackAnalysis
    post: TrackAnalysis
    delta: DeltaMetrics
    spectrum_diff: SpectrumDiff


class AnalyzeRequest(BaseModel):
    pre_id: str
    post_id: str
