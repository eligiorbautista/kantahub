// src/lib/autoAdvance.ts
// Auto-advance policy for the party flow: which queued song follows the one
// that just ended, and how long the between-songs countdown runs on the TV.
// Pure and node-testable; the TV shell owns the countdown UI (cancel
// button) and the load + play action (R-countdown, R-next).

/** Seconds the between-songs countdown runs before the next song starts. */
export const AUTO_ADVANCE_SECONDS = 5;

/**
 * The song that should play after `currentId` finishes: the queue head.
 * `currentId` is the song that just ended (may be null right after a stop);
 * it is part of the contract even though the answer is simply the head.
 * An empty queue means "nothing to advance to" (null) — the countdown is
 * then never shown.
 */
export function nextAfter(currentId: string | null, queue: string[]): string | null {
  return queue.length > 0 ? queue[0] : null;
}
