/**
 * Stacked waveform view: PRE (top) and POST (bottom).
 *
 * Performance design for long files:
 *   - Static layer (waveform + region fill) rendered to an offscreen canvas once
 *     when data or region changes — O(n_points) work, happens rarely.
 *   - Dynamic layer (playhead line) blits the static ImageData then strokes a
 *     single line — O(1) work per animation frame.
 *   - The RAF loop runs inside this component and reads audio element time
 *     directly from a ref passed down, bypassing React state for every tick.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store";
import type { WaveformData } from "../types";

const ROW_HEIGHT = 120;
const PRE_COLOR  = "#5b9cf6";
const POST_COLOR = "#f97316";
const RMS_ALPHA  = "60"; // hex opacity appended to colour string

interface Props {
  /** Ref to the master audio element used to read currentTime directly in RAF. */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onSeek: (t: number) => void;
}

export default function WaveformPanel({ audioRef, onSeek }: Props) {
  const { preWaveform, postWaveform, region, setRegion, setIsLooping } = useAppStore();

  const duration = preWaveform?.duration ?? postWaveform?.duration ?? 1;

  const containerRef   = useRef<HTMLDivElement>(null);
  const preCanvasRef   = useRef<HTMLCanvasElement>(null);
  const postCanvasRef  = useRef<HTMLCanvasElement>(null);

  // Pre-rendered static ImageData per canvas
  const staticPre  = useRef<ImageData | null>(null);
  const staticPost = useRef<ImageData | null>(null);

  const dragRef = useRef<{ startX: number; startT: number } | null>(null);

  // ── Render the static layer for one canvas ──────────────────────────────
  const renderStatic = useCallback(
    (canvas: HTMLCanvasElement | null, wf: WaveformData | null,
     color: string): ImageData | null => {
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const W = canvas.width;
      const H = canvas.height;
      const mid = H / 2;
      const scale = 0.9;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#18181c";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "#2e2e38";
      ctx.lineWidth = 1;
      [-0.5, -0.25, 0, 0.25, 0.5].forEach((v) => {
        const y = mid - v * H * scale;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      });

      // Region highlight
      if (region) {
        const rx = (region.start / duration) * W;
        const rw = ((region.end - region.start) / duration) * W;
        ctx.fillStyle = "rgba(167,139,250,0.15)";
        ctx.fillRect(rx, 0, rw, H);
        ctx.strokeStyle = "rgba(167,139,250,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, 0, rw, H);
        // Region time labels
        ctx.fillStyle = "rgba(167,139,250,0.8)";
        ctx.font = "9px monospace";
        ctx.fillText(fmtTime(region.start), rx + 3, 10);
        ctx.fillText(fmtTime(region.end),   Math.max(rx + rw - 36, rx + 3), 10);
      }

      if (!wf) return ctx.getImageData(0, 0, W, H);
      const n = wf.points;

      // RMS fill
      ctx.fillStyle = color + RMS_ALPHA;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / n) * W;
        const y = mid - wf.rms[i] * mid * scale;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      for (let i = n - 1; i >= 0; i--) {
        const x = (i / n) * W;
        const y = mid + wf.rms[i] * mid * scale;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      // Peak max
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / n) * W;
        const y = mid - wf.max[i] * mid * scale;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Peak min
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / n) * W;
        const y = mid - wf.min[i] * mid * scale;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      return ctx.getImageData(0, 0, W, H);
    },
    [region, duration]
  );

  // ── Re-render static layer when data / region changes ───────────────────
  useEffect(() => {
    staticPre.current  = renderStatic(preCanvasRef.current,  preWaveform,  PRE_COLOR);
    staticPost.current = renderStatic(postCanvasRef.current, postWaveform, POST_COLOR);
  }, [preWaveform, postWaveform, region, renderStatic]);

  // ── RAF: blit static + draw playhead — O(1) per frame ──────────────────
  useEffect(() => {
    let id: number;

    const tick = () => {
      const t = audioRef.current?.currentTime ?? 0;

      for (const [canvasRef, staticRef] of [
        [preCanvasRef, staticPre],
        [postCanvasRef, staticPost],
      ] as const) {
        const canvas = canvasRef.current;
        const img    = staticRef.current;
        if (!canvas || !img) continue;

        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        ctx.putImageData(img, 0, 0);

        // Playhead
        const px = (t / duration) * canvas.width;
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, canvas.height);
        ctx.stroke();
      }

      id = requestAnimationFrame(tick);
    };

    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [audioRef, duration]);

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => {
      const W = container.clientWidth;
      for (const ref of [preCanvasRef, postCanvasRef]) {
        const canvas = ref.current;
        if (!canvas) continue;
        canvas.width  = Math.round(W * devicePixelRatio);
        canvas.height = Math.round(ROW_HEIGHT * devicePixelRatio);
        canvas.style.width  = `${W}px`;
        canvas.style.height = `${ROW_HEIGHT}px`;
      }
      staticPre.current  = renderStatic(preCanvasRef.current,  preWaveform  as WaveformData | null, PRE_COLOR);
      staticPost.current = renderStatic(postCanvasRef.current, postWaveform as WaveformData | null, POST_COLOR);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [preWaveform, postWaveform, renderStatic]);

  // ── Pointer events ───────────────────────────────────────────────────────
  function pxToTime(e: React.MouseEvent<HTMLCanvasElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  }

  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragRef.current = { startX: e.clientX, startT: pxToTime(e) };
  }

  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragRef.current || !(e.buttons & 1)) return;
    const t = pxToTime(e);
    const start = Math.min(dragRef.current.startT, t);
    const end   = Math.max(dragRef.current.startT, t);
    if (end - start > 0.1) setRegion({ start, end });
  }

  function onPointerUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const t = pxToTime(e);
    if (dragRef.current) {
      const dist = Math.abs(e.clientX - dragRef.current.startX);
      if (dist < 5) {
        onSeek(t);
        setRegion(null);
        setIsLooping(false);
      }
    }
    dragRef.current = null;
  }

  const canvasProps = {
    onMouseDown: onPointerDown,
    onMouseMove: onPointerMove,
    onMouseUp:   onPointerUp,
    style: { cursor: "crosshair", display: "block" } as React.CSSProperties,
  };

  return (
    <div className="waveform-stack" ref={containerRef}>
      <div className="waveform-row">
        <div className="waveform-label pre">PRE</div>
        <div className="waveform-canvas-wrap">
          <canvas ref={preCanvasRef} {...canvasProps} />
          {!preWaveform && <Placeholder text="Upload PRE file" color={PRE_COLOR} />}
        </div>
      </div>

      <div className="waveform-row">
        <div className="waveform-label post">POST</div>
        <div className="waveform-canvas-wrap">
          <canvas ref={postCanvasRef} {...canvasProps} />
          {!postWaveform && <Placeholder text="Upload POST file" color={POST_COLOR} />}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ text, color }: { text: string; color: string }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontSize: 11, color, opacity: 0.45, pointerEvents: "none",
    }}>
      {text}
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
