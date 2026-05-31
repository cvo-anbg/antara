/**
 * Short-term LUFS over time, PRE and POST overlaid.
 */

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
  currentTime: number;
}

export default function LoudnessChart({ comparison, currentTime }: Props) {
  const preSeries  = comparison.pre.loudness_series;
  const postSeries = comparison.post.loudness_series;

  if (!preSeries.t.length && !postSeries.t.length) {
    return (
      <div className="chart-wrap">
        <div className="chart-title">Short-term Loudness</div>
        <div style={{ padding: "16px 8px", fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>
          No loudness series data (track too short)
        </div>
      </div>
    );
  }

  // Merge time axes
  const preMap  = new Map(preSeries.t.map((t, i) => [t, preSeries.lufs[i]]));
  const postMap = new Map(postSeries.t.map((t, i) => [t, postSeries.lufs[i]]));
  const allTimes = Array.from(new Set([...preSeries.t, ...postSeries.t])).sort((a, b) => a - b);

  const data = allTimes.map((t) => ({
    t,
    pre:  preMap.get(t)  ?? null,
    post: postMap.get(t) ?? null,
  }));

  const fmtTime = (v: number) => {
    const m = Math.floor(v / 60);
    const s = Math.floor(v % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#1a1a20", border: "1px solid #2e2e38", padding: "6px 10px", fontSize: 11, fontFamily: "var(--font-mono)" }}>
        <div style={{ color: "#7a7a94" }}>{fmtTime(label)}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey.toUpperCase()}: {typeof p.value === "number" ? `${p.value.toFixed(1)} LUFS` : "—"}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="chart-wrap">
      <div className="chart-title">Short-term Loudness (3 s window)</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="#2e2e38" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtTime}
            tick={{ fontSize: 9, fill: "#7a7a94" }}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#7a7a94" }}
            tickFormatter={(v) => `${v}`}
            width={36}
            label={{ value: "LUFS", angle: -90, position: "insideLeft", fontSize: 9, fill: "#7a7a94", dx: 10 }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* EBU R128 reference lines */}
          <ReferenceLine y={-23} stroke="#4a4a58" strokeDasharray="4 4" label={{ value: "−23 LUFS", fontSize: 8, fill: "#4a4a58", position: "insideTopRight" }} />
          <ReferenceLine y={-14} stroke="#3a3a48" strokeDasharray="4 4" label={{ value: "−14 LUFS", fontSize: 8, fill: "#3a3a48", position: "insideTopRight" }} />

          {/* Playhead */}
          <ReferenceLine x={currentTime} stroke="rgba(255,255,255,0.4)" />

          <Line dataKey="pre"  stroke="var(--pre)"  dot={false} strokeWidth={1.5} isAnimationActive={false} name="PRE" />
          <Line dataKey="post" stroke="var(--post)" dot={false} strokeWidth={1.5} isAnimationActive={false} name="POST" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
