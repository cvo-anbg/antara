import { useState } from "react";
import { useAppStore } from "../store";
import MetricsTable from "./MetricsTable";
import SpectrumChart from "./SpectrumChart";
import LoudnessChart from "./LoudnessChart";
import TrackChat from "./TrackChat";
import { buildInsights } from "../insights";
import type { TrackSegment } from "../types";

const LETTERS = "ABCDEFGHIJKLMNOP";

export default function StatsPanel() {
  const {
    comparison, regionComparison, currentTime,
    region, setRegion, setIsLooping, analyzingRegion,
    segments, sectionVerdicts,
  } = useAppStore();

  // Simple view leads with plain language; Charts view holds the evidence.
  const [view, setView] = useState<"simple" | "charts">("simple");

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
  const insights = buildInsights(active);
  const scope = isRegion && region ? `the selected region ${fmtTime(region.start)}-${fmtTime(region.end)}` : "the full track";

  function isActiveSegment(seg: TrackSegment): boolean {
    return (
      !!region &&
      Math.abs(region.start - seg.start) < 0.05 &&
      Math.abs(region.end - seg.end) < 0.05
    );
  }

  function toggleSegment(seg: TrackSegment) {
    if (isActiveSegment(seg)) {
      setRegion(null);
      setIsLooping(false);
    } else {
      setRegion({ start: seg.start, end: seg.end });
    }
  }

  return (
    <div className="stats-panel">
      {/* Scope badge + view toggle */}
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
        <InsightsPopover recommendations={insights.recommendations} />
        <div className="view-toggle" style={{ marginLeft: "auto" }}>
          <button className={view === "simple" ? "on" : ""} onClick={() => setView("simple")}>
            Simple
          </button>
          <button className={view === "charts" ? "on" : ""} onClick={() => setView("charts")}>
            Charts
          </button>
        </div>
      </div>

      <div className="ai-summary">
        <div className="section-title">Verdict</div>
        <p>{insights.summary}</p>
        {view === "simple" && (
          <button className="show-why" onClick={() => setView("charts")}>
            Show me why →
          </button>
        )}
      </div>

      {view === "simple" ? (
        <>
          <div className="beginner-metrics">
            <div className="section-title">At a Glance</div>
            <div className="beginner-grid">
              {insights.metrics.map((metric) => (
                <div key={metric.label} className={`beginner-card ${metric.status}`}>
                  <div className="beginner-card-head">
                    <span>{metric.label}</span>
                    <span className="metric-help" tabIndex={0} aria-label={metric.explanation}>?</span>
                  </div>
                  <div className="beginner-value">{metric.value}</div>
                </div>
              ))}
            </div>
          </div>

          {segments && segments.segments.length >= 2 && (
            <div className="section-verdicts">
              <div className="section-title">Section by Section</div>
              {segments.segments.map((seg) => {
                const verdict = sectionVerdicts[seg.index];
                const activeSeg = isActiveSegment(seg);
                return (
                  <button
                    key={seg.index}
                    className={`section-verdict-card ${verdict?.status ?? "neutral"}${activeSeg ? " active" : ""}`}
                    onClick={() => toggleSegment(seg)}
                    title={activeSeg ? "Click to go back to the full track" : "Click to inspect just this section"}
                  >
                    <div className="svc-head">
                      <span className="svc-letter">{LETTERS[seg.index] ?? seg.index + 1}</span>
                      <span className="svc-time">{fmtTime(seg.start)}–{fmtTime(seg.end)}</span>
                      {seg.tag && <span className="svc-tag">{seg.tag}</span>}
                    </div>
                    <div className="svc-text">
                      {verdict ? capitalize(verdict.text) : "Analysing…"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <TrackChat comparison={active} scope={scope} />
        </>
      ) : (
        <>
          <SpectrumChart comparison={active} />
          <LoudnessChart comparison={active} currentTime={currentTime} />
          <MetricsTable comparison={active} />
        </>
      )}
    </div>
  );
}

function InsightsPopover({ recommendations }: { recommendations: string[] }) {
  return (
    <div className="insights-popover">
      <button className="insight-button" aria-label="Show top recommendations" title="Top recommendations">
        i
      </button>
      <div className="insights-menu">
        <div className="insights-title">Top 3 Recommendations</div>
        <ol>
          {recommendations.map((rec) => (
            <li key={rec}>{rec}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
