/**
 * Canvas-based spectrogram renderer.
 * Data comes from the backend as a float matrix (dB), log-frequency binned.
 * Renders with a standard heat colourmap (black → purple → red → yellow → white).
 */

import { useEffect, useRef } from "react";
import type { SpectrogramData } from "../types";

interface Props {
  data: SpectrogramData | null;
  currentTime: number;
  duration: number;
  label: string;
  color: string;
}

// dB range for colour mapping
const DB_MIN = -90;
const DB_MAX = 0;

export default function SpectrogramCanvas({ data, currentTime, duration, label, color }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imageRef    = useRef<ImageData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Render spectrogram pixels once data arrives ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nFreq = data.freqs.length;
    const nTime = data.times.length;

    canvas.width  = nTime;
    canvas.height = nFreq;

    const img = ctx.createImageData(nTime, nFreq);
    imageRef.current = img;

    for (let fi = 0; fi < nFreq; fi++) {
      // Frequencies are low-to-high; canvas y=0 is top → flip vertically
      const row = nFreq - 1 - fi;
      for (let ti = 0; ti < nTime; ti++) {
        const db = data.magnitudes_db[fi][ti];
        const norm = Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)));
        const [r, g, b] = heatmap(norm);
        const idx = (row * nTime + ti) * 4;
        img.data[idx]     = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
  }, [data]);

  // ── Draw playhead on top ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || !imageRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Restore original pixels
    ctx.putImageData(imageRef.current, 0, 0);

    // Playhead line
    const px = Math.round((currentTime / duration) * canvas.width);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }, [currentTime, duration, data]);

  return (
    <div className="waveform-row" ref={containerRef}>
      <div className={`waveform-label`} style={{ color }}>
        {label}
      </div>
      <div className="waveform-canvas-wrap" style={{ height: 100 }}>
        {data ? (
          <canvas
            ref={canvasRef}
            className="spectrogram-canvas"
            style={{ height: "100%", imageRendering: "pixelated" }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color,
              opacity: 0.4,
            }}
          >
            Spectrogram will appear after analysis
          </div>
        )}
      </div>
    </div>
  );
}

// Inferno-like colourmap: [0,1] → [r,g,b]
function heatmap(t: number): [number, number, number] {
  // keyframes: black, purple, red, orange, yellow, white
  const keys: [number, number, number, number][] = [
    [0.00, 0,   0,   0  ],
    [0.20, 68,  1,   84 ],
    [0.40, 188, 55,  84 ],
    [0.60, 253, 128, 37 ],
    [0.80, 252, 212, 82 ],
    [1.00, 252, 255, 164],
  ];

  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const lo = keys[i - 1];
      const hi = keys[i];
      const f  = (t - lo[0]) / (hi[0] - lo[0]);
      return [
        Math.round(lo[1] + (hi[1] - lo[1]) * f),
        Math.round(lo[2] + (hi[2] - lo[2]) * f),
        Math.round(lo[3] + (hi[3] - lo[3]) * f),
      ];
    }
  }
  return [252, 255, 164];
}
