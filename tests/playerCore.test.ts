import { describe, it, expect } from "vitest";
import { createPlayerStore } from "@/lib/playerCore";

describe("player store", () => {
  it("requires a user gesture before audio starts", () => {
    const store = createPlayerStore();
    expect(store.state().audioUnlocked).toBe(false);
    store.unlockAudio();               // simulates first play press
    expect(store.state().audioUnlocked).toBe(true);
  });
  it("tracks play/pause state", () => {
    const store = createPlayerStore();
    store.unlockAudio();
    store.playSong("id1"); expect(store.state().isPlaying).toBe(true);
    store.pause();         expect(store.state().isPlaying).toBe(false);
  });
});
