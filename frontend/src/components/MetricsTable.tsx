/**
 * PRE | POST | Δ table.
 *
 * Delta colour convention (labelled in the header):
 *   orange = POST increased relative to PRE  (louder, more peaks, less dynamics)
 *   blue   = POST decreased relative to PRE  (quieter, more headroom, more dynamics)
 * For metrics where higher is better (dynamics, phase correlation):
 *   orange = decreased (bad), blue = increased (good) — reversed.
 */

import type { ComparisonResult } from "../types";

interface Props {
  comparison: ComparisonResult;
}

type HigherIsBetter = boolean;

interface Row {
  label: string;
  beginnerLabel: string;
  help: string;
  preVal:  number | null | undefined;
  postVal: number | null | undefined;
  delta:   number | null | undefined;
  fmt:     (v: number) => string;
  higherIsBetter: HigherIsBetter;
  unit?: string;
}

type RawRow = Omit<Row, "beginnerLabel" | "help">;

const fmtLUFS = (v: number) => `${v.toFixed(1)} LUFS`;
const fmtLU   = (v: number) => `${v.toFixed(1)} LU`;
const fmtDB   = (v: number) => `${v.toFixed(1)} dB`;
const fmtHz   = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
const fmtFlat = (v: number) => v.toExponential(2);
const fmtCount = (v: number) => String(Math.round(v));
const fmtDC   = (v: number) => v.toFixed(5);
const fmtCorr = (v: number) => v.toFixed(3);

export default function MetricsTable({ comparison }: Props) {
  const pre  = comparison.pre.metrics;
  const post = comparison.post.metrics;
  const d    = comparison.delta;

  const sections: { title: string; rows: RawRow[] }[] = [
    {
      title: "Loudness",
      rows: [
        { label: "Integrated",     preVal: pre.loudness.integrated_lufs,    postVal: post.loudness.integrated_lufs,    delta: d.integrated_lufs,    fmt: fmtLUFS, higherIsBetter: false },
        { label: "LRA",            preVal: pre.loudness.lra,                 postVal: post.loudness.lra,                 delta: d.lra,                 fmt: fmtLU,   higherIsBetter: true  },
        { label: "Max Momentary",  preVal: pre.loudness.max_momentary_lufs,  postVal: post.loudness.max_momentary_lufs,  delta: d.max_momentary_lufs,  fmt: fmtLUFS, higherIsBetter: false },
        { label: "Max Short-term", preVal: pre.loudness.max_short_term_lufs, postVal: post.loudness.max_short_term_lufs, delta: d.max_short_term_lufs, fmt: fmtLUFS, higherIsBetter: false },
      ],
    },
    {
      title: "Peaks",
      rows: [
        { label: "Sample Peak",  preVal: pre.peaks.sample_peak_dbfs, postVal: post.peaks.sample_peak_dbfs, delta: d.sample_peak_dbfs, fmt: fmtDB, higherIsBetter: false },
        { label: "True Peak",    preVal: pre.peaks.true_peak_dbtp,   postVal: post.peaks.true_peak_dbtp,   delta: d.true_peak_dbtp,   fmt: fmtDB, higherIsBetter: false },
      ],
    },
    {
      title: "Dynamics",
      rows: [
        { label: "RMS",           preVal: pre.dynamics.rms_dbfs,        postVal: post.dynamics.rms_dbfs,        delta: d.rms_dbfs,        fmt: fmtDB, higherIsBetter: false },
        { label: "Crest Factor",  preVal: pre.dynamics.crest_factor_db,  postVal: post.dynamics.crest_factor_db,  delta: d.crest_factor_db,  fmt: fmtDB, higherIsBetter: true  },
        { label: "PSR",           preVal: pre.dynamics.psr_db,           postVal: post.dynamics.psr_db,           delta: d.psr_db,           fmt: fmtDB, higherIsBetter: true  },
      ],
    },
    {
      title: "Tonal",
      rows: [
        { label: "Centroid",   preVal: pre.spectral.centroid_hz, postVal: post.spectral.centroid_hz, delta: d.centroid_hz, fmt: fmtHz,   higherIsBetter: true },
        { label: "Rolloff",    preVal: pre.spectral.rolloff_hz,  postVal: post.spectral.rolloff_hz,  delta: d.rolloff_hz,  fmt: fmtHz,   higherIsBetter: true },
        { label: "Flatness",   preVal: pre.spectral.flatness,    postVal: post.spectral.flatness,    delta: d.flatness,    fmt: fmtFlat, higherIsBetter: true },
      ],
    },
    {
      title: "Quality",
      rows: [
        { label: "Clipping",      preVal: pre.quality.clip_count,       postVal: post.quality.clip_count,       delta: d.clip_count,       fmt: fmtCount, higherIsBetter: false },
        { label: "DC Offset L",   preVal: pre.quality.dc_offset_l,      postVal: post.quality.dc_offset_l,      delta: d.dc_offset_l,      fmt: fmtDC,    higherIsBetter: false },
        { label: "DC Offset R",   preVal: pre.quality.dc_offset_r ?? undefined, postVal: post.quality.dc_offset_r ?? undefined, delta: d.dc_offset_r ?? undefined, fmt: fmtDC, higherIsBetter: false },
        { label: "Phase Corr.",   preVal: pre.quality.phase_correlation ?? undefined, postVal: post.quality.phase_correlation ?? undefined, delta: d.phase_correlation ?? undefined, fmt: fmtCorr, higherIsBetter: true },
        { label: "Noise Floor",   preVal: pre.quality.noise_floor_dbfs, postVal: post.quality.noise_floor_dbfs, delta: d.noise_floor_dbfs, fmt: fmtDB,    higherIsBetter: false },
      ],
    },
  ];

  const friendlySections = sections.map((section) => ({
    ...section,
    rows: section.rows.map(withBeginnerCopy),
  }));

  return (
    <>
      {/* Colour legend */}
      <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--text-dim)", paddingBottom: 4 }}>
        <span style={{ color: "var(--diff-pos)" }}>▲ orange = POST increased</span>
        <span style={{ color: "var(--diff-neg)" }}>▼ blue = POST decreased</span>
      </div>

      {friendlySections.map(({ title, rows }) => (
        <div key={title} className="panel-section">
          <div className="section-title">{title}</div>
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="col-pre">PRE</th>
                <th className="col-post">POST</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.preVal == null && row.postVal == null) return null;
                return (
                  <tr key={row.label}>
                    <td>
                      <span>{row.beginnerLabel}</span>
                      <span className="metric-help" tabIndex={0} aria-label={row.help}>?</span>
                      <span className="metric-technical">{row.label}</span>
                    </td>
                    <td className="col-pre">{row.preVal != null ? row.fmt(row.preVal) : "—"}</td>
                    <td className="col-post">{row.postVal != null ? row.fmt(row.postVal) : "—"}</td>
                    <td className={deltaClass(row.delta, row.higherIsBetter)}>
                      {formatDelta(row.delta, row.fmt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function deltaClass(delta: number | null | undefined, higherIsBetter: boolean): string {
  if (delta == null || !isFinite(delta) || Math.abs(delta) < 0.005) return "delta-neu";
  const increased = delta > 0;
  // If higher is better: increased = good (blue), decreased = bad (orange)
  // If lower is better: increased = bad (orange), decreased = good (blue)
  const isPositive = higherIsBetter ? increased : !increased;
  return isPositive ? "delta-neg" : "delta-pos";
}

function formatDelta(delta: number | null | undefined, fmt: (v: number) => string): string {
  if (delta == null || !isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  return sign + fmt(delta).replace(/[^0-9.+-].*/, "") + fmt(delta).replace(/[0-9.+-]+/, "");
}

function withBeginnerCopy(row: RawRow): Row {
  const copy: Record<string, { beginnerLabel: string; help: string }> = {
    Integrated: {
      beginnerLabel: "Average loudness",
      help: "The overall perceived loudness across the whole track. More negative LUFS is quieter.",
    },
    LRA: {
      beginnerLabel: "Loudness range",
      help: "How much the track moves between quieter and louder sections. Very low values can feel flat.",
    },
    "Max Momentary": {
      beginnerLabel: "Loudest instant",
      help: "The loudest very short moment. Useful for spotting sudden hits or jumps.",
    },
    "Max Short-term": {
      beginnerLabel: "Loudest section",
      help: "The loudest few-second area. Often points to the chorus or biggest drop.",
    },
    "Sample Peak": {
      beginnerLabel: "Highest sample",
      help: "The highest digital sample value. Close to 0 means there is little headroom.",
    },
    "True Peak": {
      beginnerLabel: "Real-world peak",
      help: "Estimates peaks that can appear during playback conversion. Keep below 0, often below -1 dBTP for streaming.",
    },
    RMS: {
      beginnerLabel: "Average power",
      help: "A simple average energy reading. Higher usually sounds denser or louder.",
    },
    "Crest Factor": {
      beginnerLabel: "Peak contrast",
      help: "The gap between peaks and average level. Higher usually means more punch.",
    },
    PSR: {
      beginnerLabel: "Punch score",
      help: "Peak-to-short-term loudness ratio. Lower values can mean heavier limiting or less transient impact.",
    },
    Centroid: {
      beginnerLabel: "Brightness center",
      help: "The average center of the tone. Higher usually means brighter.",
    },
    Rolloff: {
      beginnerLabel: "Top-end reach",
      help: "Where most of the high-frequency energy ends. Higher can mean more brightness or air.",
    },
    Flatness: {
      beginnerLabel: "Noise-like tone",
      help: "Higher means the sound is more noise-like or evenly spread; lower means more tonal or pitched.",
    },
    Clipping: {
      beginnerLabel: "Clipped samples",
      help: "Samples that hit digital maximum. These can cause harsh distortion.",
    },
    "DC Offset L": {
      beginnerLabel: "Left offset",
      help: "Checks whether the waveform is shifted away from center. Usually this should be near zero.",
    },
    "DC Offset R": {
      beginnerLabel: "Right offset",
      help: "Checks whether the right channel waveform is shifted away from center. Usually this should be near zero.",
    },
    "Phase Corr.": {
      beginnerLabel: "Stereo safety",
      help: "How well left and right channels work together. Very low or negative values can cause mono playback issues.",
    },
    "Noise Floor": {
      beginnerLabel: "Background noise",
      help: "The quiet background level. Less negative means more audible noise.",
    },
  };

  return {
    ...row,
    beginnerLabel: copy[row.label]?.beginnerLabel ?? row.label,
    help: copy[row.label]?.help ?? "Compares PRE and POST for this measurement.",
  };
}
