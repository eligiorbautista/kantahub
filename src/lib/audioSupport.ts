// src/lib/audioSupport.ts
// Browser capability check for the karaoke engine.
//
// SpessaSynth renders through an AudioWorklet, and browsers only expose the
// AudioWorklet API in a SECURE CONTEXT. `http://localhost` counts as secure, but
// a plain `http://192.168.1.2:3005` — exactly how a TV or laptop reaches a home
// server — does not, so the synth cannot be built there. Without this check the
// TV just showed frozen lyrics (and a flood of console errors) with no
// explanation.
//
// Verified in Chromium:
//   insecure origin -> AudioWorklet "undefined", ctx.audioWorklet "undefined"
//   secure origin   -> AudioWorklet "function",  ctx.audioWorklet "object"
// (`AudioWorkletNode` is exposed either way, so it is NOT a usable signal, and
// reading `AudioContext.prototype.audioWorklet` throws "called on an object that
// does not implement interface BaseAudioContext" — which crashed the TV once.)

let cached: boolean | null = null;

function detect(): boolean {
  // The authoritative test: the very accessor the synth uses, read off a real
  // context (the accessor's getter rejects a prototype as its receiver).
  try {
    const ctx = new AudioContext();
    const supported = typeof (ctx as AudioContext).audioWorklet !== "undefined";
    void ctx.close();
    return supported;
  } catch {
    // No AudioContext here (or it refused to be built): fall through to the
    // interface global, which is secure-context gated too.
  }
  try {
    return typeof AudioWorklet !== "undefined";
  } catch {
    // Even probing the global can throw in some browsers; treat that as "no".
    return false;
  }
}

/**
 * True when this browser exposes the AudioWorklet API on this origin.
 * Cached: the answer cannot change during a page's life, and probing builds a
 * throwaway AudioContext.
 */
export function audioWorkletSupported(): boolean {
  cached ??= detect();
  return cached;
}

/** Test-only: forget the cached probe. */
export function resetAudioSupportCache(): void {
  cached = null;
}

/** Human-readable, actionable explanation for the TV screen. */
export function audioUnsupportedMessage(): string {
  return "This browser blocks the karaoke engine on a plain http:// address — the audio engine needs https:// or localhost. Fix: open this page on the TV itself, serve the app over https://, or allow this origin in the browser (Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure).";
}
