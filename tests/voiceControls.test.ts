import { describe, it, expect } from "vitest";
import { transposeToPlaybackRate, GUIDE_CHANNEL_DEFAULT } from "@/lib/voiceControls";

describe("voiceControls", () => {
  it("defaults the guide channel to MIDI channel 4 (index 3)", () => {
    expect(GUIDE_CHANNEL_DEFAULT).toBe(3);
  });
  it("keeps playback rate in a safe range", () => {
    expect(transposeToPlaybackRate(0)).toBe(1);
    expect(transposeToPlaybackRate(12)).toBeGreaterThan(1);
  });
});
