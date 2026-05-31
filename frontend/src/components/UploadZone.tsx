import React, { useRef, useState } from "react";
import { uploadTrack, fetchWaveform } from "../api";
import { useAppStore } from "../store";
import type { TrackInfo } from "../types";

interface Props {
  role: "pre" | "post";
}

export default function UploadZone({ role }: Props) {
  const store = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const track    = role === "pre" ? store.preTrack    : store.postTrack;
  const uploading = role === "pre" ? store.uploadingPre : store.uploadingPost;
  const progress  = role === "pre" ? store.uploadPreProgress : store.uploadPostProgress;

  const setUploading = role === "pre" ? store.setUploadingPre : store.setUploadingPost;
  const setProgress  = role === "pre" ? store.setUploadPreProgress : store.setUploadPostProgress;
  const setTrack     = role === "pre" ? store.setPreTrack : store.setPostTrack;
  const setWaveform  = role === "pre" ? store.setPreWaveform : store.setPostWaveform;

  async function handleFile(file: File) {
    store.setError(null);
    store.setComparison(null);
    setUploading(true);
    setProgress(0);

    try {
      const res = await uploadTrack(file, role, setProgress);
      const info: TrackInfo = {
        id:          res.track_id,
        filename:    res.filename,
        duration:    res.duration,
        sample_rate: res.sample_rate,
        channels:    res.channels,
        format:      res.format,
      };
      setTrack(info);

      // Fetch waveform envelope for display
      const wf = await fetchWaveform(res.track_id, 1000);
      setWaveform(wf);
    } catch (e) {
      store.setError((e as Error).message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const loaded = track !== null;
  const zoneClass = [
    "drop-zone",
    dragOver ? "drag-over" : "",
    loaded ? `loaded-${role}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={zoneClass}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".wav,.flac,.aiff,.aif,.mp3,.m4a,.aac"
        onChange={onFileInput}
        style={{ display: "none" }}
      />

      <div className={`drop-role ${role}`}>{role.toUpperCase()}</div>

      {loaded ? (
        <>
          <div style={{ fontWeight: 600, fontSize: 12, textAlign: "center" }}>
            {track!.filename}
          </div>
          <div className="drop-label">
            {formatDur(track!.duration)} · {track!.sample_rate / 1000} kHz ·{" "}
            {track!.channels === 1 ? "mono" : "stereo"} · {track!.format.toUpperCase()}
          </div>
          <div className="drop-label" style={{ marginTop: 4 }}>
            Click or drop to replace
          </div>
        </>
      ) : uploading ? (
        <>
          <div className="drop-label">Uploading & analysing…</div>
          <div className="progress-bar" style={{ width: "80%" }}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="drop-label">Drop a file or click to browse</div>
          <div className="drop-label">WAV · FLAC · AIFF · MP3 · M4A</div>
        </>
      )}
    </div>
  );
}

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
