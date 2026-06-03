"""Track-aware chat endpoint backed by measured comparison data."""

from fastapi import APIRouter

from app.models import ChatRequest, ChatResponse, ComparisonResult

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    question = req.question.strip()
    if not question:
        return ChatResponse(
            answer="Ask me something about the PRE vs POST comparison and I will explain it from the measured data.",
            followups=_followups(),
        )

    answer = _answer_question(question, req.comparison, req.scope)
    return ChatResponse(answer=answer, followups=_followups())


def _answer_question(question: str, comparison: ComparisonResult, scope: str | None) -> str:
    q = question.lower()
    ctx = _context(comparison)
    prefix = f"For {scope}, " if scope else ""

    if any(word in q for word in ["bright", "brightness", "harsh", "air", "top", "treble", "high"]):
        return prefix + _brightness_answer(ctx)

    if any(word in q for word in ["bass", "low end", "sub", "kick", "mud", "warm", "boomy"]):
        return prefix + _low_end_answer(ctx)

    if any(word in q for word in ["punch", "dynamic", "compressed", "squash", "limit", "flat"]):
        return prefix + _dynamics_answer(ctx)

    if any(word in q for word in ["loud", "stream", "spotify", "apple", "level", "lufs"]):
        return prefix + _loudness_answer(ctx)

    if any(word in q for word in ["clip", "distort", "distortion", "peak", "headroom"]):
        return prefix + _peak_answer(ctx)

    if any(word in q for word in ["frequency", "freq", "range", "changed", "difference", "eq"]):
        return prefix + _frequency_answer(ctx)

    if any(word in q for word in ["fix", "recommend", "improve", "first", "should i"]):
        return prefix + _recommendation_answer(ctx)

    return prefix + _general_answer(ctx)


def _context(comparison: ComparisonResult) -> dict:
    pre = comparison.pre.metrics
    post = comparison.post.metrics
    d = comparison.delta
    bands = _band_changes(comparison)
    top_band = bands[0] if bands else None

    return {
        "pre": pre,
        "post": post,
        "delta": d,
        "bands": bands,
        "top_band": top_band,
        "loudness_delta": d.integrated_lufs,
        "psr_delta": d.psr_db,
        "crest_delta": d.crest_factor_db,
        "centroid_delta": d.centroid_hz,
        "true_peak": post.peaks.true_peak_dbtp,
        "clip_count": post.quality.clip_count,
    }


def _band_changes(comparison: ComparisonResult) -> list[dict]:
    bands = [
        ("sub bass", 20, 60, "deep rumble and weight"),
        ("bass", 60, 160, "kick and bass fullness"),
        ("low mids", 160, 500, "warmth or muddiness"),
        ("mids", 500, 2000, "vocal and instrument body"),
        ("presence", 2000, 6000, "clarity and forwardness"),
        ("air", 6000, 16000, "sparkle, brightness, and hiss"),
    ]
    out = []
    freqs = comparison.spectrum_diff.freqs
    db = comparison.spectrum_diff.db

    for name, low, high, plain in bands:
        vals = [
            db[i]
            for i, freq in enumerate(freqs)
            if i < len(db) and low <= freq < high
        ]
        if not vals:
            continue
        avg = sum(vals) / len(vals)
        if abs(avg) >= 0.75:
            out.append({
                "name": name,
                "avg": avg,
                "plain": plain,
                "direction": "more" if avg > 0 else "less",
            })

    return sorted(out, key=lambda item: abs(item["avg"]), reverse=True)


def _brightness_answer(ctx: dict) -> str:
    delta = ctx["centroid_delta"]
    air = _find_band(ctx["bands"], "air")
    presence = _find_band(ctx["bands"], "presence")
    pieces = []

    if abs(delta) < 120:
        pieces.append("The overall brightness center is about the same.")
    elif delta > 0:
        pieces.append(f"POST measures brighter overall: the brightness center moved up by about {_hz(delta)}.")
    else:
        pieces.append(f"POST measures darker overall: the brightness center moved down by about {_hz(abs(delta))}.")

    for band in [presence, air]:
        if band:
            pieces.append(f"The {band['name']} band has {band['direction']} energy in POST by about {_db(abs(band['avg']))}, which affects {band['plain']}.")

    pieces.append("Use this as a guide, then A/B at matched loudness so level does not trick your ear.")
    return " ".join(pieces)


def _low_end_answer(ctx: dict) -> str:
    sub = _find_band(ctx["bands"], "sub bass")
    bass = _find_band(ctx["bands"], "bass")
    low_mids = _find_band(ctx["bands"], "low mids")
    found = [band for band in [sub, bass, low_mids] if band]

    if not found:
        return "The low end does not show a large measured shift. If it still sounds different, check the loudest sections and compare with loudness matching turned on."

    lines = [
        f"POST has {band['direction']} {band['name']} by about {_db(abs(band['avg']))}, affecting {band['plain']}."
        for band in found
    ]
    return " ".join(lines)


def _dynamics_answer(ctx: dict) -> str:
    psr = ctx["psr_delta"]
    crest = ctx["crest_delta"]
    if psr < -2 or crest < -2:
        return f"POST likely lost some punch. PSR changed by {psr:+.1f} dB and crest factor changed by {crest:+.1f} dB, which usually means the master is more compressed or limited."
    if psr > 1 or crest > 1:
        return f"POST looks more dynamic. PSR changed by {psr:+.1f} dB and crest factor changed by {crest:+.1f} dB, so transients may stand out more."
    return f"Punch looks broadly similar. PSR changed by {psr:+.1f} dB and crest factor changed by {crest:+.1f} dB, which is not a dramatic shift."


def _loudness_answer(ctx: dict) -> str:
    delta = ctx["loudness_delta"]
    post_lufs = ctx["post"].loudness.integrated_lufs
    relation = "louder" if delta > 0 else "quieter"
    if abs(delta) < 0.2:
        change = "about the same loudness"
    else:
        change = f"{abs(delta):.1f} LU {relation}"

    note = "That is not automatically good or bad; streaming services often normalize playback, so clarity and punch matter more than simply being louder."
    return f"POST is {change}, landing at {post_lufs:.1f} LUFS integrated. {note}"


def _peak_answer(ctx: dict) -> str:
    peak = ctx["true_peak"]
    clips = ctx["clip_count"]
    if clips > 0:
        return f"POST has {clips} clipped samples and reaches {peak:.1f} dBTP true peak. Listen for harshness on loud drums, vocals, or transients."
    if peak > -1:
        return f"POST peaks at {peak:.1f} dBTP, very close to digital maximum. For safer playback and streaming conversion, consider leaving a bit more headroom."
    return f"POST peak safety looks reasonable at {peak:.1f} dBTP, and no clipped samples were detected."


def _frequency_answer(ctx: dict) -> str:
    if not ctx["bands"]:
        return "No frequency band changed dramatically. The PRE and POST tonal balance are fairly close by the measured spectrum."

    lines = [
        f"{idx + 1}. {band['name'].title()}: {band['direction']} in POST by about {_db(abs(band['avg']))}, affecting {band['plain']}."
        for idx, band in enumerate(ctx["bands"][:3])
    ]
    return "The biggest frequency changes are: " + " ".join(lines)


def _recommendation_answer(ctx: dict) -> str:
    recs = []
    if ctx["true_peak"] > -1:
        recs.append("lower the limiter ceiling or output slightly to leave more true-peak headroom")
    if ctx["clip_count"] > 0:
        recs.append("inspect the loudest hits for clipping")
    if ctx["psr_delta"] < -2 or ctx["crest_delta"] < -2:
        recs.append("A/B the loudest section because POST may have lost punch")
    if ctx["top_band"]:
        band = ctx["top_band"]
        recs.append(f"check the {band['name']} change because POST has {band['direction']} there")

    if not recs:
        return "I would start with listening rather than fixing. The measured comparison does not show an obvious technical problem."

    return "I would start here: " + "; ".join(recs[:3]) + "."


def _general_answer(ctx: dict) -> str:
    loud = ctx["loudness_delta"]
    dyn = ctx["psr_delta"]
    band = ctx["top_band"]
    band_text = (
        f"The biggest tonal move is {band['direction']} {band['name']} by about {_db(abs(band['avg']))}."
        if band else
        "The tonal balance is fairly close overall."
    )
    return f"POST is {loud:+.1f} LU different in average loudness compared with PRE. PSR changed {dyn:+.1f} dB, which is the quick punch indicator. {band_text}"


def _followups() -> list[str]:
    return [
        "Did the master lose punch?",
        "Which frequency range changed the most?",
        "Is the post version too loud?",
    ]


def _find_band(bands: list[dict], name: str) -> dict | None:
    return next((band for band in bands if band["name"] == name), None)


def _db(value: float) -> str:
    return f"{value:.1f} dB"


def _hz(value: float) -> str:
    if value >= 1000:
        return f"{value / 1000:.1f} kHz"
    return f"{value:.0f} Hz"
