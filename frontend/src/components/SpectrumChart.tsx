/**
 * Frequency-response comparison chart.
 *
 * Shows PRE and POST average spectra overlaid on a log-frequency axis,
 * with a toggle to show the POST−PRE difference curve.
 * This is the headline view per the spec.
 */

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { ComparisonResult } from "../types";

interface Props {
  comparison: ComparisonResult;
}

export default function SpectrumChart({ comparison }: Props) {
  const [showPre,  setShowPre]  = useState(true);
  const [showPost, setShowPost] = useState(true);
  const [showDiff, setShowDiff] = useState(true);

  const { pre, post, spectrum_diff } = comparison;

  // Build chart data — one entry per frequency bin
  // Both pre and post share the same freq grid (same log bins from backend)
  const freqs = pre.spectrum.freqs;
  const data = freqs.map((f, i) => ({
    hz: f,
    pre:  pre.spectrum.db[i] ?? null,
    post: post.spectrum.db[i] ?? null,
    diff: spectrum_diff.db[i] ?? null,
  }));

  // Subsample if needed (recharts gets slow beyond ~300 points)
  const stride = Math.max(1, Math.floor(data.length / 256));
  const chartData = data.filter((_, i) => i % stride === 0);

  const fmtHz = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
    return `${Math.round(v)}`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const hz = typeof label === "number" ? label : parseFloat(label);
    const hzStr = hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${Math.round(hz)} Hz`;
    return (
      <div style={{ background: "#1a1a20", border: "1px solid #2e2e38", padding: "6px 10px", fontSize: 11, fontFamily: "var(--font-mono)" }}>
        <div style={{ color: "#7a7a94", marginBottom: 4 }}>{hzStr}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey.toUpperCase()}: {typeof p.value === "number" ? p.value.toFixed(1) : "—"} dB
          </div>
        ))}
      </div>
    );
  };

  // Y-axis range: auto-fit to visible data
  const allDb = chartData.flatMap((d) => [
    showPre  ? d.pre  : null,
    showPost ? d.post : null,
    showDiff ? d.diff : null,
  ]).filter((v): v is number => v !== null && isFinite(v));
  const yMin = allDb.length ? Math.floor(Math.min(...allDb) / 10) * 10 : -90;
  const yMax = allDb.length ? Math.ceil(Math.max(...allDb)  / 10) * 10 : 0;

  return (
    <div className="chart-wrap">
      <div className="chart-title">Frequency Response</div>

      <div className="chart-toggle-row">
        <button className={showPre  ? "on" : ""} onClick={() => setShowPre(!showPre)}
          style={{ borderColor: showPre ? "var(--pre)" : undefined, color: showPre ? "var(--pre)" : undefined }}>
          PRE
        </button>
        <button className={showPost ? "on" : ""} onClick={() => setShowPost(!showPost)}
          style={{ borderColor: showPost ? "var(--post)" : undefined, color: showPost ? "var(--post)" : undefined }}>
          POST
        </button>
        <button className={showDiff ? "on" : ""} onClick={() => setShowDiff(!showDiff)}
          style={{ borderColor: showDiff ? "var(--accent)" : undefined, color: showDiff ? "var(--accent)" : undefined }}>
          Δ DIFF
        </button>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
          <CartesianGrid stroke="#2e2e38" strokeDasharray="3 3" />
          <XAxis
            dataKey="hz"
            scale="log"
            domain={["dataMin", "dataMax"]}
            type="number"
            tickFormatter={fmtHz}
            tick={{ fontSize: 9, fill: "#7a7a94" }}
            label={{ value: "Hz", position: "insideBottom", offset: -8, fontSize: 9, fill: "#7a7a94" }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 9, fill: "#7a7a94" }}
            tickFormatter={(v) => `${v}`}
            width={32}
            label={{ value: "dB", angle: -90, position: "insideLeft", fontSize: 9, fill: "#7a7a94", dx: 8 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#4a4a58" strokeDasharray="4 4" />

          {showPre && (
            <Line
              dataKey="pre"
              stroke="var(--pre)"
              dot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
              name="PRE"
            />
          )}
          {showPost && (
            <Line
              dataKey="post"
              stroke="var(--post)"
              dot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
              name="POST"
            />
          )}
          {showDiff && (
            <Line
              dataKey="diff"
              stroke="var(--accent)"
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              isAnimationActive={false}
              name="Δ"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
