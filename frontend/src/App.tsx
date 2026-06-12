import { useEffect, useRef, useState } from "react";
import { runAnalysis, runRegionAnalysis, fetchSegments, fetchSpectrogram } from "./api";
import { useAppStore } from "./store";
import { useAudioEngine } from "./hooks/useAudioEngine";
import UploadZone from "./components/UploadZone";
import Transport from "./components/Transport";
import WaveformPanel from "./components/WaveformPanel";
import SpectrogramCanvas from "./components/SpectrogramCanvas";
import StatsPanel from "./components/StatsPanel";
import SegmentStrip from "./components/SegmentStrip";
import { buildSectionVerdict } from "./insights";
import type { SpectrogramData } from "./types";

export default function App() {
  const {
    preTrack, postTrack,
    comparison, setComparison,
    setRegionComparison,
    currentTime,
    region,
    segments, setSegments, setSectionVerdict,
    analyzing, setAnalyzing,
    setAnalyzingRegion,
    error, setError,
  } = useAppStore();

  const { seek, preElRef } = useAudioEngine();

  const [preSpec,  setPreSpec]  = useState<SpectrogramData | null>(null);
  const [postSpec, setPostSpec] = useState<SpectrogramData | null>(null);

  const ready         = !!preTrack && !!postTrack;
  const hasComparison = !!comparison;

  // ── Full-track analysis ──────────────────────────────────────────────────
  async function handleAnalyze() {
    if (!preTrack || !postTrack) return;
    setAnalyzing(true);
    setError(null);
    setRegionComparison(null);
    try {
      const result = await runAnalysis(preTrack.id, postTrack.id);
      setComparison(result);
      const [ps, qs] = await Promise.all([
        fetchSpectrogram(preTrack.id),
        fetchSpectrogram(postTrack.id),
      ]);
      setPreSpec(ps);
      setPostSpec(qs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  // Auto-analyze when both tracks are loaded
  useEffect(() => {
    if (preTrack && postTrack && !comparison && !analyzing) {
      handleAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preTrack?.id, postTrack?.id]);

  // Fetch song sections once a comparison exists (non-fatal if it fails)
  useEffect(() => {
    setSegments(null);
    if (!comparison || !preTrack) return;
    let cancelled = false;
    fetchSegments(preTrack.id)
      .then((s) => { if (!cancelled) setSegments(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [comparison, preTrack?.id]);

  // Compute one-line verdicts per section in the background, sequentially.
  // Each call hits /api/region-analyze, which is cached server-side, so the
  // same requests fired by clicking a section later are instant.
  useEffect(() => {
    if (!segments || !preTrack || !postTrack) return;
    let cancelled = false;
    (async () => {
      for (const seg of segments.segments) {
        if (cancelled) return;
        try {
          const result = await runRegionAnalysis(preTrack.id, postTrack.id, seg.start, seg.end);
          if (!cancelled) setSectionVerdict(seg.index, buildSectionVerdict(result));
        } catch {
          // Verdicts are progressive enhancement — skip failures silently
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, preTrack?.id, postTrack?.id]);

  // ── Region analysis — debounced 600 ms after region stops changing ────────
  const regionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!region || !preTrack || !postTrack || !comparison) {
      setRegionComparison(null);
      return;
    }

    if (regionTimerRef.current) clearTimeout(regionTimerRef.current);
    regionTimerRef.current = setTimeout(async () => {
      setAnalyzingRegion(true);
      try {
        const result = await runRegionAnalysis(
          preTrack.id, postTrack.id, region.start, region.end
        );
        setRegionComparison(result as any);
      } catch (e) {
        // Region analysis failures are non-fatal — silently clear
        setRegionComparison(null);
      } finally {
        setAnalyzingRegion(false);
      }
    }, 600);

    return () => {
      if (regionTimerRef.current) clearTimeout(regionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region?.start, region?.end, preTrack?.id, postTrack?.id]);

  const duration = preTrack?.duration ?? postTrack?.duration ?? 1;
  const showUpload = !ready;

  return (
    <div className="app-layout">
      <Transport />

      <div className="main-area">
        {/* ── Center ─────────────────────────────────────────────────────── */}
        <div className="center-panel">
          {showUpload ? (
            <div className="upload-area">
              <UploadZone role="pre" />
              <UploadZone role="post" />
            </div>
          ) : (
            <>
              {/* Waveforms — canvas reads audio time directly at 60 Hz */}
              <WaveformPanel audioRef={preElRef} onSeek={seek} />

              {/* Auto-detected song sections — click one to drill into it */}
              <SegmentStrip />

              {/* Spectrograms — only shown after analysis */}
              {hasComparison && (
                <div className="waveform-stack" style={{ flex: "none" }}>
                  <SpectrogramCanvas
                    data={preSpec}
                    currentTime={currentTime}
                    duration={duration}
                    label="SPEC PRE"
                    color="var(--pre)"
                  />
                  <SpectrogramCanvas
                    data={postSpec}
                    currentTime={currentTime}
                    duration={duration}
                    label="SPEC POST"
                    color="var(--post)"
                  />
                </div>
              )}

              {/* Bottom bar: replace-file + re-analyze */}
              <div style={{
                display: "flex", gap: 8, padding: "8px 12px",
                borderTop: "1px solid var(--border)", flexShrink: 0,
                alignItems: "center",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1 }}>
                  <UploadZone role="pre" />
                  <UploadZone role="post" />
                </div>
                {ready && !analyzing && (
                  <button
                    className="analyze-btn"
                    style={{ padding: "6px 16px", fontSize: 11, whiteSpace: "nowrap" }}
                    onClick={handleAnalyze}
                  >
                    Re-analyse
                  </button>
                )}
                {analyzing && (
                  <div style={{ color: "var(--text-dim)", fontSize: 12, whiteSpace: "nowrap" }}>
                    Analysing…
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right: stats ─────────────────────────────────────────────────── */}
        <div className="right-panel">
          {ready && !hasComparison && !analyzing && (
            <div style={{ padding: 16 }}>
              <button className="analyze-btn" onClick={handleAnalyze}>Analyse</button>
            </div>
          )}
          {analyzing && (
            <div style={{ padding: 16, color: "var(--text-dim)", fontSize: 12, textAlign: "center" }}>
              Running analysis…
            </div>
          )}
          <StatsPanel />
        </div>
      </div>

      {error && (
        <div
          className="toast"
          onClick={() => setError(null)}
          style={{ cursor: "pointer" }}
          title="Click to dismiss"
        >
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
