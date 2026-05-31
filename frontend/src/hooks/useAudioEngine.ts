/**
 * Web Audio engine for gapless A/B playback.
 *
 * Architecture:
 *   <audio id="pre">  →  MediaElementSourceNode  →  GainNode(gainPre)  ─┐
 *   <audio id="post"> →  MediaElementSourceNode  →  GainNode(gainPost) ─┤→ destination
 *
 * Both elements always play together (same currentTime, same play/pause).
 * Switching A/B flips which GainNode is at 1.0 — no seek, no click.
 *
 * Loudness-match: when enabled, the louder track's gain is reduced by
 *   ΔdB = post_lufs - pre_lufs  (or its inverse) so perceptual levels match.
 *   This is a *playback-only* adjustment, never persisted.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { audioUrl } from "../api";


export function useAudioEngine() {
  const {
    preTrack, postTrack, comparison,
    isPlaying, activeSource, loudnessMatch,
    region, isLooping,
    setIsPlaying, setCurrentTime, setActiveSource, setLoudnessMatch,
  } = useAppStore();

  const ctxRef     = useRef<AudioContext | null>(null);
  const preElRef   = useRef<HTMLAudioElement | null>(null);
  const postElRef  = useRef<HTMLAudioElement | null>(null);
  const gainPreRef = useRef<GainNode | null>(null);
  const gainPostRef = useRef<GainNode | null>(null);
  const rafRef     = useRef<number>(0);

  // ── Initialise audio graph once ──────────────────────────────────────────
  useEffect(() => {
    if (!preTrack || !postTrack) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const preEl  = new Audio();
    const postEl = new Audio();
    preEl.crossOrigin  = "anonymous";
    postEl.crossOrigin = "anonymous";
    preEl.preload  = "auto";
    postEl.preload = "auto";
    preEl.src  = audioUrl(preTrack.id);
    postEl.src = audioUrl(postTrack.id);
    preElRef.current  = preEl;
    postElRef.current = postEl;

    const srcPre  = ctx.createMediaElementSource(preEl);
    const srcPost = ctx.createMediaElementSource(postEl);

    const gainPre  = ctx.createGain();
    const gainPost = ctx.createGain();
    gainPreRef.current  = gainPre;
    gainPostRef.current = gainPost;

    srcPre.connect(gainPre).connect(ctx.destination);
    srcPost.connect(gainPost).connect(ctx.destination);

    // Apply initial gain values
    _applyGains(gainPre, gainPost, "pre", true, null);

      // Throttled time sync: update React state at ~8 Hz (enough for charts/transport)
    // The canvas playhead reads preElRef directly at 60 Hz — no React overhead.
    let lastStoreUpdate = 0;
    const tick = () => {
      const now = preEl.currentTime;
      if (Math.abs(now - lastStoreUpdate) >= 0.125) {
        setCurrentTime(now);
        lastStoreUpdate = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      preEl.pause();
      postEl.pause();
      ctx.close();
      preElRef.current  = null;
      postElRef.current = null;
      ctxRef.current    = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preTrack?.id, postTrack?.id]);

  // ── Re-apply gains when source / loudnessMatch / comparison changes ──────
  useEffect(() => {
    if (!gainPreRef.current || !gainPostRef.current) return;
    const lufsOffset = _lufsOffset(comparison, loudnessMatch);
    _applyGains(gainPreRef.current, gainPostRef.current, activeSource, loudnessMatch, lufsOffset);
  }, [activeSource, loudnessMatch, comparison]);

  // ── Loop region ───────────────────────────────────────────────────────────
  useEffect(() => {
    const pre  = preElRef.current;
    const post = postElRef.current;
    if (!pre || !post || !region || !isLooping) return;

    const check = () => {
      const el = activeSource === "pre" ? pre : post;
      if (el.currentTime >= region.end) {
        pre.currentTime  = region.start;
        post.currentTime = region.start;
      }
    };

    const id = setInterval(check, 50);
    return () => clearInterval(id);
  }, [region, isLooping, activeSource]);

  // ── Public controls ───────────────────────────────────────────────────────
  const play = useCallback(async () => {
    const ctx = ctxRef.current;
    const pre = preElRef.current;
    const post = postElRef.current;
    if (!ctx || !pre || !post) return;
    if (ctx.state === "suspended") await ctx.resume();
    await Promise.all([pre.play(), post.play()]);
    setIsPlaying(true);
  }, [setIsPlaying]);

  const pause = useCallback(() => {
    preElRef.current?.pause();
    postElRef.current?.pause();
    setIsPlaying(false);
  }, [setIsPlaying]);

  const togglePlay = useCallback(() => {
    isPlaying ? pause() : play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (preElRef.current)  preElRef.current.currentTime  = time;
    if (postElRef.current) postElRef.current.currentTime = time;
    setCurrentTime(time);
  }, [setCurrentTime]);

  const nudge = useCallback((deltaSec: number) => {
    const el = activeSource === "pre" ? preElRef.current : postElRef.current;
    if (!el) return;
    seek(Math.max(0, el.currentTime + deltaSec));
  }, [activeSource, seek]);

  const switchSource = useCallback((src: typeof activeSource) => {
    setActiveSource(src);
  }, [setActiveSource]);

  const toggleLoudnessMatch = useCallback(() => {
    setLoudnessMatch(!loudnessMatch);
  }, [loudnessMatch, setLoudnessMatch]);

  // Expose the master element ref so consumers can read currentTime at 60 Hz
  // without routing through React state.
  return { play, pause, togglePlay, seek, nudge, switchSource, toggleLoudnessMatch, preElRef };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _applyGains(
  gainPre: GainNode,
  gainPost: GainNode,
  activeSource: "pre" | "post",
  loudnessMatch: boolean,
  lufsOffset: number | null
) {
  const offset = loudnessMatch && lufsOffset !== null ? lufsOffset : 0;
  // offset = post_lufs - pre_lufs (positive → post is louder → reduce post)

  if (activeSource === "pre") {
    gainPre.gain.value  = 1.0;
    gainPost.gain.value = 0.0;
  } else {
    gainPre.gain.value  = 0.0;
    // Apply loudness-match attenuation to the louder track
    const postGain = offset > 0 ? Math.pow(10, -offset / 20) : 1.0;
    gainPost.gain.value = postGain;
  }
}

function _lufsOffset(
  comparison: ReturnType<typeof useAppStore.getState>["comparison"],
  loudnessMatch: boolean
): number | null {
  if (!loudnessMatch || !comparison) return null;
  const preL  = comparison.pre.metrics.loudness.integrated_lufs;
  const postL = comparison.post.metrics.loudness.integrated_lufs;
  if (!isFinite(preL) || !isFinite(postL)) return null;
  return postL - preL; // positive = post is louder
}
