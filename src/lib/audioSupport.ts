// src/lib/audioSupport.ts
// Browser capability check for the karaoke engine.
//
// SpessaSynth renders through an AudioWorklet, and browsers only expose
// `AudioContext.prototype.audioWorklet` in a SECURE CONTEXT. `http://localhost`
// counts as secure, but a plain `http://192.168.1.2:3005` — exactly how a TV or
// laptop reaches a home server — does not, so `ctx.audioWorklet` is undefined
// and every attempt to load the synth throws. Without this check the TV just
// showed frozen lyrics (and a flood of console errors) with no explanation.

/** True when the browser exposes the AudioWorklet API on this origin. */
export function audioWorkletSupported(): boolean {
  if (typeof AudioContext === "undefined") return false;
  return typeof AudioContext.prototype.audioWorklet !== "undefined";
}

/** Human-readable, actionable explanation for the TV screen. */
export function audioUnsupportedMessage(): string {
  return "This browser blocks the karaoke engine on a plain http:// address — the audio engine needs https:// or localhost. Fix: open this page on the TV itself, serve the app over https://, or allow this origin in the browser (Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure).";
}
