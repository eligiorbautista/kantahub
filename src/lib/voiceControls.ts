// Pure helpers for the karaoke voice controls (guide-melody mute, transpose,
// tempo, volume). Browser-free so they can be unit-tested under vitest with
// `environment: "node"`; Transport wires them to the PlayerEngine.

// 0-indexed channel 3 = MIDI channel 4, the common guide/melody channel in
// KAR files. The Transport toggle binds to muteChannel(GUIDE_CHANNEL_DEFAULT).
export const GUIDE_CHANNEL_DEFAULT = 3;

export const TRANSPOSE_MIN = -12; // semitones, one octave down
export const TRANSPOSE_MAX = 12; // semitones, one octave up
export const TRANSPOSE_DEFAULT = 0;

export const TEMPO_MIN = 0.5; // × playback rate
export const TEMPO_MAX = 1.5;
export const TEMPO_DEFAULT = 1;

export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;
export const VOLUME_DEFAULT = 1;

export function clampTranspose(semis: number): number {
  return Math.min(TRANSPOSE_MAX, Math.max(TRANSPOSE_MIN, semis));
}

// Convert a semitone offset into a playback-rate multiplier (2^(n/12)),
// pinned to the same safe range as tempo so nothing fed to
// sequencer.playbackRate can run away.
export function transposeToPlaybackRate(semis: number): number {
  return clampTempo(2 ** (semis / 12));
}

export function clampTempo(rate: number): number {
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, rate));
}

export function clampVolume(v: number): number {
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, v));
}
