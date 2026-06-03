export interface UploadResponse {
  track_id: string;
  role: "pre" | "post";
  filename: string;
  duration: number;
  sample_rate: number;
  channels: number;
  format: string;
  cached: boolean;
}

export interface WaveformData {
  track_id: string;
  points: number;
  duration: number;
  sample_rate: number;
  min: number[];
  max: number[];
  rms: number[];
  times: number[];
}

export interface SpectrogramData {
  track_id: string;
  freqs: number[];
  times: number[];
  magnitudes_db: number[][];
}

export interface LoudnessMetrics {
  integrated_lufs: number;
  lra: number;
  max_momentary_lufs: number;
  max_short_term_lufs: number;
}

export interface PeakMetrics {
  sample_peak_dbfs: number;
  true_peak_dbtp: number;
}

export interface DynamicsMetrics {
  crest_factor_db: number;
  psr_db: number;
  rms_dbfs: number;
}

export interface SpectralMetrics {
  centroid_hz: number;
  rolloff_hz: number;
  flatness: number;
}

export interface QualityMetrics {
  clip_count: number;
  dc_offset_l: number;
  dc_offset_r: number | null;
  phase_correlation: number | null;
  noise_floor_dbfs: number;
}

export interface TrackMetrics {
  loudness: LoudnessMetrics;
  peaks: PeakMetrics;
  dynamics: DynamicsMetrics;
  spectral: SpectralMetrics;
  quality: QualityMetrics;
}

export interface SpectrumData {
  freqs: number[];
  db: number[];
}

export interface LoudnessSeries {
  t: number[];
  lufs: number[];
}

export interface TrackAnalysis {
  track_id: string;
  metrics: TrackMetrics;
  spectrum: SpectrumData;
  loudness_series: LoudnessSeries;
}

export interface AlignmentResult {
  offset_samples: number;
  offset_ms: number;
  confidence: number;
}

export interface DeltaMetrics {
  integrated_lufs: number | null;
  lra: number | null;
  max_momentary_lufs: number | null;
  max_short_term_lufs: number | null;
  sample_peak_dbfs: number | null;
  true_peak_dbtp: number | null;
  crest_factor_db: number | null;
  psr_db: number | null;
  rms_dbfs: number | null;
  centroid_hz: number | null;
  rolloff_hz: number | null;
  flatness: number | null;
  clip_count: number | null;
  dc_offset_l: number | null;
  dc_offset_r: number | null;
  phase_correlation: number | null;
  noise_floor_dbfs: number | null;
}

export interface ComparisonResult {
  alignment: AlignmentResult;
  pre: TrackAnalysis;
  post: TrackAnalysis;
  delta: DeltaMetrics;
  spectrum_diff: SpectrumData;
}

export interface ChatResponse {
  answer: string;
  followups: string[];
}

export interface TrackInfo {
  id: string;
  filename: string;
  duration: number;
  sample_rate: number;
  channels: number;
  format: string;
}
