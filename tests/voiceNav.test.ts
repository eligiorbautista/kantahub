import { describe, it, expect } from "vitest";
import { nextVoiceIndex } from "@/lib/voiceNav";

describe("nextVoiceIndex", () => {
  it("moves within bounds and clamps at the ends", () => {
    expect(nextVoiceIndex(0, 5, 1)).toBe(1);
    expect(nextVoiceIndex(4, 5, 1)).toBe(4);
    expect(nextVoiceIndex(0, 5, -1)).toBe(0);
    expect(nextVoiceIndex(3, 5, -1)).toBe(2);
  });
  it("returns -1 for an empty row", () => {
    expect(nextVoiceIndex(0, 0, 1)).toBe(-1);
  });
});
