/**
 * Clickable section strip under the waveforms.
 *
 * Sections come from /api/segments (MFCC-based structural segmentation).
 * Clicking a section selects it as the region, which triggers the existing
 * region-analyze flow — the stats panel then explains that section in plain
 * language. Clicking the active section again returns to the full track.
 */

import { useAppStore } from "../store";
import type { TrackSegment } from "../types";

const LETTERS = "ABCDEFGHIJKLMNOP";

export default function SegmentStrip() {
  const { segments: data, region, setRegion, setIsLooping } = useAppStore();

  if (!data || data.segments.length < 2) return null;
  const duration = data.duration || 1;

  function isActive(seg: TrackSegment): boolean {
    return (
      !!region &&
      Math.abs(region.start - seg.start) < 0.05 &&
      Math.abs(region.end - seg.end) < 0.05
    );
  }

  function onClick(seg: TrackSegment) {
    if (isActive(seg)) {
      setRegion(null);
      setIsLooping(false);
    } else {
      setRegion({ start: seg.start, end: seg.end });
    }
  }

  return (
    <div className="segment-strip">
      <div className="waveform-label">SECTIONS</div>
      <div className="segment-strip-track">
        {data.segments.map((seg) => {
          const active = isActive(seg);
          const widthPct = ((seg.end - seg.start) / duration) * 100;
          const label = LETTERS[seg.index] ?? `${seg.index + 1}`;
          return (
            <button
              key={seg.index}
              className={`segment-chip${active ? " active" : ""}`}
              style={{ width: `${widthPct}%` }}
              onClick={() => onClick(seg)}
              title={
                `Section ${label} · ${fmtTime(seg.start)}–${fmtTime(seg.end)}` +
                (seg.tag ? ` · ${seg.tag} part of the song` : "") +
                "\nClick to compare just this section"
              }
            >
              <span className="segment-chip-label">{label}</span>
              {seg.tag && <span className="segment-chip-tag">{seg.tag}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
