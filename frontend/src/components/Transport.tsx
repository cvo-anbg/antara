import { useEffect } from "react";
import { useAppStore } from "../store";
import { useAudioEngine } from "../hooks/useAudioEngine";

function formatTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return "0:00.0";
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

export default function Transport() {
  const {
    preTrack, postTrack, comparison,
    isPlaying, currentTime, activeSource, loudnessMatch,
    region, isLooping, setIsLooping, setRegion, setRegionComparison,
  } = useAppStore();

  const { togglePlay, seek, nudge, switchSource, toggleLoudnessMatch } =
    useAudioEngine();

  function clearRegion() {
    setRegion(null);
    setRegionComparison(null);
    setIsLooping(false);
  }

  const duration = preTrack?.duration ?? postTrack?.duration ?? 0;
  const alignment = comparison?.alignment;

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          nudge(e.shiftKey ? -5 : -0.5);
          break;
        case "ArrowRight":
          e.preventDefault();
          nudge(e.shiftKey ? 5 : 0.5);
          break;
        case "KeyA":
          switchSource("pre");
          break;
        case "KeyB":
          switchSource("post");
          break;
        case "KeyL":
          setIsLooping(!isLooping);
          break;
        case "Escape":
          clearRegion();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, nudge, switchSource, isLooping, setIsLooping]);

  const ready = !!preTrack && !!postTrack && !!comparison;

  return (
    <div className="transport">
      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        disabled={!ready}
        style={{ minWidth: 36, fontSize: 15 }}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      {/* Time display */}
      <div className="time-display mono">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>

      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        disabled={!ready}
        onChange={(e) => seek(parseFloat(e.target.value))}
        style={{ flex: 1, minWidth: 80, accentColor: "var(--accent)", cursor: "pointer" }}
      />

      {/* A/B toggle */}
      <div className="ab-group">
        <button
          className={activeSource === "pre" ? "active-pre" : ""}
          onClick={() => switchSource("pre")}
          disabled={!ready}
          title="Listen to PRE  [A]"
        >
          PRE
        </button>
        <button
          className={activeSource === "post" ? "active-post" : ""}
          onClick={() => switchSource("post")}
          disabled={!ready}
          title="Listen to POST  [B]"
        >
          POST
        </button>
      </div>

      {/* Loudness match */}
      <button
        className={loudnessMatch ? "active" : ""}
        onClick={toggleLoudnessMatch}
        disabled={!ready}
        title="Normalise playback gain to equal LUFS (playback-only, never persisted)"
      >
        ≈ LUFS
      </button>

      {/* Loop */}
      <button
        className={isLooping ? "active" : ""}
        onClick={() => {
          if (isLooping) {
            setIsLooping(false);
          } else if (region) {
            setIsLooping(true);
          }
        }}
        disabled={!region}
        title="Loop selected region  [L]"
      >
        ⟲ Loop
      </button>

      {/* Region clear — visible when a region is active */}
      {region && (
        <button
          onClick={clearRegion}
          title="Clear region selection  [Escape]"
          style={{ fontSize: 11 }}
        >
          ✕ Region
        </button>
      )}

      {/* Alignment badge */}
      {alignment && (
        <div className="align-badge mono" title="Detected time offset between PRE and POST">
          Δ{alignment.offset_ms >= 0 ? "+" : ""}
          {alignment.offset_ms.toFixed(1)} ms
          {" "}(conf {(alignment.confidence * 100).toFixed(0)}%)
        </div>
      )}
    </div>
  );
}
