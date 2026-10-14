// Pure helper for arrow-key navigation within the voice-controls row. Kept
// browser-free so it is unit-testable under vitest with `environment: "node"`;
// Transport's VoiceControls wires it to DOM focus.

// Next focus index when arrowing `dir` from `current` within a row of `count`
// controls. Clamps at the ends (no wrap) and returns -1 when the row is empty.
export function nextVoiceIndex(
  current: number,
  count: number,
  dir: 1 | -1,
): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, current + dir));
}
