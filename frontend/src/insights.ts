import type { ComparisonResult } from "./types";

type ToneBand = {
  name: string;
  min: number;
  max: number;
  plain: string;
};

const TONE_BANDS: ToneBand[] = [
  { name: "Sub bass", min: 20, max: 60, plain: "deep weight and rumble" },
  { name: "Bass", min: 60, max: 160, plain: "kick and bass fullness" },
  { name: "Low mids", min: 160, max: 500, plain: "warmth or muddiness" },
  { name: "Mids", min: 500, max: 2000, plain: "body of vocals and instruments" },
  { name: "Presence", min: 2000, max: 6000, plain: "clarity and forwardness" },
  { name: "Air", min: 6000, max: 16000, plain: "brightness, sparkle, and hiss" },
];

export interface BeginnerMetric {
  label: string;
  value: string;
  status: "good" | "watch" | "neutral";
  explanation: string;
}

export interface InsightBundle {
  summary: string;
  recommendations: string[];
  metrics: BeginnerMetric[];
}

export function buildInsights(comparison: ComparisonResult): InsightBundle {
  const d = comparison.delta;
  const pre = comparison.pre.metrics;
  const post = comparison.post.metrics;
  const bandMoves = summarizeBands(comparison);
  const loudnessDelta = d.integrated_lufs ?? 0;
  const psrDelta = d.psr_db ?? 0;
  const crestDelta = d.crest_factor_db ?? 0;
  const peak = post.peaks.true_peak_dbtp;
  const clipping = post.quality.clip_count;
  const centroidDelta = d.centroid_hz ?? 0;

  const loudnessText = Math.abs(loudnessDelta) < 0.7
    ? "about the same loudness"
    : loudnessDelta > 0
      ? `${abs1(loudnessDelta)} LU louder`
      : `${abs1(loudnessDelta)} LU quieter`;

  const dynamicText = Math.abs(psrDelta) < 0.8 && Math.abs(crestDelta) < 0.8
    ? "similar punch and movement"
    : psrDelta < 0 || crestDelta < 0
      ? "less punch and a more controlled shape"
      : "more punch and transient contrast";

  const toneLead = bandMoves[0];
  const toneText = toneLead
    ? `${toneLead.direction} ${toneLead.name.toLowerCase()} (${toneLead.plain})`
    : Math.abs(centroidDelta) < 150
      ? "a similar tonal balance"
      : centroidDelta > 0
        ? "a brighter overall balance"
        : "a darker overall balance";

  const summary = `Compared with PRE, POST is ${loudnessText}, has ${dynamicText}, and shows ${toneText}.`;

  const recommendations: string[] = [];
  if (peak > -1) {
    recommendations.push("Leave a little more peak headroom. POST is close to 0 dBTP, which can distort on some platforms.");
  }
  if (clipping > 0) {
    recommendations.push("Check the loudest moments for clipping. Even a few clipped samples can make drums or vocals sound harsh.");
  }
  if (psrDelta < -2 || crestDelta < -2) {
    recommendations.push("A/B the chorus or loudest section at matched loudness. The master may be trading punch for level.");
  }
  if (bandMoves[0] && Math.abs(bandMoves[0].avgDb) >= 2.5) {
    const verb = bandMoves[0].avgDb > 0 ? "added" : "reduced";
    recommendations.push(`Listen closely to the ${bandMoves[0].name.toLowerCase()}. POST ${verb} about ${abs1(bandMoves[0].avgDb)} dB there, affecting ${bandMoves[0].plain}.`);
  }
  if ((d.lra ?? 0) < -2) {
    recommendations.push("The loudness range got smaller. If the song feels flatter, ease compression or limiting in the busiest parts.");
  }
  if (post.quality.noise_floor_dbfs > pre.quality.noise_floor_dbfs + 3) {
    recommendations.push("Noise floor rose after processing. Check fades, pauses, and high-frequency boosts for added hiss.");
  }
  if (recommendations.length === 0) {
    recommendations.push("The comparison looks balanced. Focus your listening on vocal clarity, low-end translation, and whether the loudest section still feels exciting.");
  }

  const metrics: BeginnerMetric[] = [
    {
      label: "Overall loudness",
      value: Math.abs(loudnessDelta) < 0.1 ? "No real change" : `${loudnessDelta > 0 ? "+" : ""}${loudnessDelta.toFixed(1)} LU`,
      status: Math.abs(loudnessDelta) > 4 ? "watch" : "neutral",
      explanation: "How much louder or quieter the finished version is on average. Bigger is not always better.",
    },
    {
      label: "Punch / dynamics",
      value: Math.abs(psrDelta) < 0.1 ? "Similar" : `${psrDelta > 0 ? "+" : ""}${psrDelta.toFixed(1)} dB`,
      status: psrDelta < -2 ? "watch" : psrDelta > 0.8 ? "good" : "neutral",
      explanation: "A quick read on whether drums and accents still jump out. Lower often means more compressed.",
    },
    {
      label: "Brightness",
      value: Math.abs(centroidDelta) < 100 ? "Similar" : centroidDelta > 0 ? "Brighter" : "Darker",
      status: Math.abs(centroidDelta) > 900 ? "watch" : "neutral",
      explanation: "Whether the average tone moved toward more high-frequency energy or less.",
    },
    {
      label: "Peak safety",
      value: `${peak.toFixed(1)} dBTP`,
      status: peak > -1 || clipping > 0 ? "watch" : "good",
      explanation: "How close POST gets to digital maximum. Safer masters usually leave a little room below 0.",
    },
    {
      label: "Problem samples",
      value: clipping === 0 ? "None found" : `${Math.round(clipping)} clipped`,
      status: clipping > 0 ? "watch" : "good",
      explanation: "Clipped samples can sound crunchy or sharp, especially on loud drums and vocals.",
    },
  ];

  return { summary, recommendations: recommendations.slice(0, 3), metrics };
}

function summarizeBands(comparison: ComparisonResult) {
  return TONE_BANDS.map((band) => {
    const vals = comparison.spectrum_diff.freqs
      .map((freq, i) => ({ freq, db: comparison.spectrum_diff.db[i] }))
      .filter((p) => p.freq >= band.min && p.freq < band.max && Number.isFinite(p.db));
    const avgDb = vals.length
      ? vals.reduce((sum, p) => sum + p.db, 0) / vals.length
      : 0;
    return {
      ...band,
      avgDb,
      direction: avgDb > 0 ? "more" : "less",
    };
  })
    .filter((band) => Math.abs(band.avgDb) >= 1)
    .sort((a, b) => Math.abs(b.avgDb) - Math.abs(a.avgDb));
}

function abs1(value: number) {
  return Math.abs(value).toFixed(1);
}
