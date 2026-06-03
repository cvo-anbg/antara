import type {
  ChatResponse,
  ComparisonResult,
  SpectrogramData,
  UploadResponse,
  WaveformData,
} from "./types";

const BASE = "/api";

export async function uploadTrack(
  file: File,
  role: "pre" | "post",
  onProgress?: (pct: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("role", role);

    xhr.open("POST", `${BASE}/upload`);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const msg = tryParseDetail(xhr.responseText) ?? `Upload failed (${xhr.status})`;
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

export async function runAnalysis(
  preId: string,
  postId: string
): Promise<ComparisonResult> {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pre_id: preId, post_id: postId }),
  });
  if (!res.ok) {
    const msg = tryParseDetail(await res.text()) ?? `Analysis failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchWaveform(
  trackId: string,
  points = 1000
): Promise<WaveformData> {
  const res = await fetch(`${BASE}/waveform/${trackId}?points=${points}`);
  if (!res.ok) throw new Error(`Waveform fetch failed (${res.status})`);
  return res.json();
}

export async function fetchSpectrogram(trackId: string): Promise<SpectrogramData> {
  const res = await fetch(`${BASE}/spectrogram/${trackId}`);
  if (!res.ok) throw new Error(`Spectrogram fetch failed (${res.status})`);
  return res.json();
}

export function audioUrl(trackId: string): string {
  return `${BASE}/audio/${trackId}`;
}

export async function runRegionAnalysis(
  preId: string,
  postId: string,
  startSec: number,
  endSec: number
): Promise<ComparisonResult> {
  const res = await fetch(`${BASE}/region-analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pre_id: preId, post_id: postId, start_sec: startSec, end_sec: endSec }),
  });
  if (!res.ok) {
    const msg = tryParseDetail(await res.text()) ?? `Region analysis failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function askTrackQuestion(
  question: string,
  comparison: ComparisonResult,
  scope?: string
): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, comparison, scope }),
  });
  if (!res.ok) {
    const msg = tryParseDetail(await res.text()) ?? `Chat failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

function tryParseDetail(text: string): string | null {
  try {
    const j = JSON.parse(text);
    return j.detail ?? null;
  } catch {
    return null;
  }
}
