import { create } from "zustand";
import type { ComparisonResult, SegmentData, TrackInfo, WaveformData } from "./types";
import type { SectionVerdict } from "./insights";

export type ActiveSource = "pre" | "post";

interface AppState {
  preTrack:   TrackInfo | null;
  postTrack:  TrackInfo | null;
  comparison: ComparisonResult | null;
  /** Region-scoped re-analysis result — shown in stats panel when a region is active. */
  regionComparison: ComparisonResult | null;
  preWaveform:  WaveformData | null;
  postWaveform: WaveformData | null;
  /** Auto-detected song sections (from /api/segments). */
  segments: SegmentData | null;
  /** One-line verdicts per section index, filled in lazily in the background. */
  sectionVerdicts: Record<number, SectionVerdict>;

  isPlaying:    boolean;
  currentTime:  number;
  activeSource: ActiveSource;
  loudnessMatch: boolean;

  region:    { start: number; end: number } | null;
  isLooping: boolean;

  uploadingPre:      boolean;
  uploadingPost:     boolean;
  uploadPreProgress: number;
  uploadPostProgress: number;
  analyzing:       boolean;
  analyzingRegion: boolean;
  error: string | null;

  setPreTrack:    (t: TrackInfo | null) => void;
  setPostTrack:   (t: TrackInfo | null) => void;
  setComparison:  (c: ComparisonResult | null) => void;
  setRegionComparison: (c: ComparisonResult | null) => void;
  setPreWaveform:  (w: WaveformData | null) => void;
  setPostWaveform: (w: WaveformData | null) => void;
  setSegments: (s: SegmentData | null) => void;
  setSectionVerdict: (index: number, v: SectionVerdict) => void;
  setIsPlaying:    (v: boolean) => void;
  setCurrentTime:  (t: number) => void;
  setActiveSource: (s: ActiveSource) => void;
  setLoudnessMatch: (v: boolean) => void;
  setRegion:    (r: { start: number; end: number } | null) => void;
  setIsLooping: (v: boolean) => void;
  setUploadingPre:       (v: boolean) => void;
  setUploadingPost:      (v: boolean) => void;
  setUploadPreProgress:  (v: number) => void;
  setUploadPostProgress: (v: number) => void;
  setAnalyzing:       (v: boolean) => void;
  setAnalyzingRegion: (v: boolean) => void;
  setError: (e: string | null) => void;
  reset:    () => void;
}

const initial = {
  preTrack:   null,
  postTrack:  null,
  comparison: null,
  regionComparison: null,
  preWaveform:  null,
  postWaveform: null,
  segments: null,
  sectionVerdicts: {},
  isPlaying:     false,
  currentTime:   0,
  activeSource:  "pre" as ActiveSource,
  loudnessMatch: true,
  region:    null,
  isLooping: false,
  uploadingPre:       false,
  uploadingPost:      false,
  uploadPreProgress:  0,
  uploadPostProgress: 0,
  analyzing:       false,
  analyzingRegion: false,
  error: null,
};

export const useAppStore = create<AppState>((set) => ({
  ...initial,
  setPreTrack:    (t) => set({ preTrack: t }),
  setPostTrack:   (t) => set({ postTrack: t }),
  setComparison:  (c) => set({ comparison: c }),
  setRegionComparison: (c) => set({ regionComparison: c }),
  setPreWaveform:  (w) => set({ preWaveform: w }),
  setPostWaveform: (w) => set({ postWaveform: w }),
  setSegments: (s) => set({ segments: s, sectionVerdicts: {} }),
  setSectionVerdict: (index, v) =>
    set((state) => ({ sectionVerdicts: { ...state.sectionVerdicts, [index]: v } })),
  setIsPlaying:    (v) => set({ isPlaying: v }),
  setCurrentTime:  (t) => set({ currentTime: t }),
  setActiveSource: (s) => set({ activeSource: s }),
  setLoudnessMatch: (v) => set({ loudnessMatch: v }),
  setRegion:    (r) => set({ region: r }),
  setIsLooping: (v) => set({ isLooping: v }),
  setUploadingPre:       (v) => set({ uploadingPre: v }),
  setUploadingPost:      (v) => set({ uploadingPost: v }),
  setUploadPreProgress:  (v) => set({ uploadPreProgress: v }),
  setUploadPostProgress: (v) => set({ uploadPostProgress: v }),
  setAnalyzing:       (v) => set({ analyzing: v }),
  setAnalyzingRegion: (v) => set({ analyzingRegion: v }),
  setError: (e) => set({ error: e }),
  reset: () => set(initial),
}));
