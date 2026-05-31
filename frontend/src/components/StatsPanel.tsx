import { useAppStore } from "../store";
import MetricsTable from "./MetricsTable";
import SpectrumChart from "./SpectrumChart";
import LoudnessChart from "./LoudnessChart";

export default function StatsPanel() {
  const {
    comparison, regionComparison, currentTime,
    region, analyzingRegion,
  } = useAppStore();

  // Show region comparison when one is available; fall back to global
  const active = regionComparison ?? comparison;

  if (!active) {
    return (
      <div className="stats-panel" style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
        <div style={{ color: "var(--text-dim)", fontSize: 12, textAlign: "center", padding: 24 }}>
          Upload both files and run analysis to see metrics.
        </div>
      </div>
    );
  }

  const isRegion = !!regionComparison;

  return (
    <div className="stats-panel">
      {/* Scope badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: -8 }}>
        {isRegion && region ? (
          <div style={{
            fontSize: 10, fontFamily: "var(--font-mono)",
            background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.4)",
            borderRadius: 4, padding: "2px 8px", color: "var(--accent)",
          }}>
            REGION {fmtTime(region.start)}–{fmtTime(region.end)}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            FULL TRACK
          </div>
        )}
        {analyzingRegion && (
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Analysing region…</div>
        )}
      </div>

      <SpectrumChart comparison={active} />
      <LoudnessChart comparison={active} currentTime={currentTime} />
      <MetricsTable comparison={active} />
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
