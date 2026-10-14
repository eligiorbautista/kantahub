// src/lib/score.ts
// Cosmetic "fun score" shown at the end of a song. PURE and node-testable.
//
// IMPORTANT (R-nomic): this is a joke/cosmetic number. There is NO microphone
// capture and NO pitch analysis anywhere in this app — the score is drawn
// purely from the injected random source and must be labeled as fun-only in
// the UI so nobody mistakes it for real singing feedback.
//
// The transform biases high: pow(u, 0.45) pulls samples toward 1, so the
// median lands in the low 90s and the mean stays comfortably above 85 while
// the full 70..100 range remains reachable.

/** The minimum cosmetic score. */
export const SCORE_MIN = 70;
/** The maximum cosmetic score. */
export const SCORE_MAX = 100;

const BIAS_EXPONENT = 0.45;
const SPAN = SCORE_MAX - SCORE_MIN;

/** Reaction table, highest tier first. */
const REACTIONS: ReadonlyArray<{ min: number; reaction: string }> = [
  { min: 90, reaction: "Ang galing!" },
  { min: 80, reaction: "Solid!" },
  { min: SCORE_MIN, reaction: "Good job!" },
];

function reactionFor(score: number): string {
  for (const tier of REACTIONS) {
    if (score >= tier.min) return tier.reaction;
  }
  return REACTIONS[REACTIONS.length - 1].reaction;
}

/**
 * Roll a cosmetic score from the injected random source (`() => [0, 1)`).
 * `rand` is a parameter so the result is deterministic under test. The score
 * is always an integer in 70..100, biased high, with a matching reaction.
 */
export function rollScore(rand: () => number): { score: number; reaction: string } {
  const biased = Math.pow(rand(), BIAS_EXPONENT);
  const score = Math.min(SCORE_MAX, Math.max(SCORE_MIN, SCORE_MIN + Math.round(SPAN * biased)));
  return { score, reaction: reactionFor(score) };
}
