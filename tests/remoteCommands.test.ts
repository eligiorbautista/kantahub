// tests/remoteCommands.test.ts
import { describe, it, expect } from "vitest";
import { applyCommand } from "@/lib/remoteCommands";
import type { RemoteState } from "@/lib/remoteStore";

function makeState(patch: Partial<RemoteState> = {}): RemoteState {
  return {
    session: "main",
    queue: [],
    currentId: null,
    currentSinger: "",
    phase: "idle",
    isPlaying: false,
    positionSec: 0,
    seekNonce: 0,
    countdownEndsAt: null,
    score: null,
    scoreEndsAt: null,
    serverNow: 0,
    lyricOffsetSec: 0,
    volume: 0.8,
    reloadNonce: 0,
    ...patch,
  };
}

const NOW = 1_000_000;

describe("applyCommand", () => {
  it("enqueues a song with a singer", () => {
    const s = applyCommand(makeState(), { kind: "enqueue", songId: "a", singer: "Juan" });
    expect(s.queue).toEqual([{ songId: "a", singer: "Juan" }]);
  });

  it("rejects a duplicate enqueue", () => {
    const s0 = makeState({ queue: [{ songId: "a", singer: "" }] });
    const s1 = applyCommand(s0, { kind: "enqueue", songId: "a" });
    expect(s1).toBe(s0);
  });

  it("dequeues by index", () => {
    const s0 = makeState({ queue: [{ songId: "a", singer: "" }, { songId: "b", singer: "" }] });
    const s1 = applyCommand(s0, { kind: "dequeue", index: 0 });
    expect(s1.queue).toEqual([{ songId: "b", singer: "" }]);
  });

  it("reorders entries", () => {
    const s0 = makeState({
      queue: [{ songId: "a", singer: "" }, { songId: "b", singer: "" }, { songId: "c", singer: "" }],
    });
    const s1 = applyCommand(s0, { kind: "reorder", from: 2, to: 0 });
    expect(s1.queue.map((e) => e.songId)).toEqual(["c", "a", "b"]);
  });

  it("plays a specific song with a server-authoritative countdown", () => {
    const s0 = makeState({ queue: [{ songId: "a", singer: "Juan" }] });
    const s1 = applyCommand(s0, { kind: "play", songId: "a", countdownSec: 5 }, NOW);
    expect(s1.currentId).toBe("a");
    expect(s1.currentSinger).toBe("Juan");
    expect(s1.phase).toBe("countdown");
    expect(s1.isPlaying).toBe(false);
    expect(s1.countdownEndsAt).toBe(NOW + 5000);
    expect(s1.queue).toEqual([]); // pulled out of the queue
  });

  it("plays immediately without a countdown", () => {
    const s1 = applyCommand(makeState(), { kind: "play", songId: "x", singer: "Ana" }, NOW);
    expect(s1.phase).toBe("playing");
    expect(s1.isPlaying).toBe(true);
    expect(s1.countdownEndsAt).toBeNull();
  });

  it("next pops the queue head with a countdown", () => {
    const s0 = makeState({ queue: [{ songId: "a", singer: "Juan" }, { songId: "b", singer: "" }] });
    const s1 = applyCommand(s0, { kind: "next", countdownSec: 5 }, NOW);
    expect(s1.currentId).toBe("a");
    expect(s1.currentSinger).toBe("Juan");
    expect(s1.queue).toEqual([{ songId: "b", singer: "" }]);
    expect(s1.phase).toBe("countdown");
    expect(s1.countdownEndsAt).toBe(NOW + 5000);
  });

  it("next on an empty queue returns to idle", () => {
    const s0 = makeState({ currentId: "a", phase: "playing", isPlaying: true });
    const s1 = applyCommand(s0, { kind: "next" }, NOW);
    expect(s1.phase).toBe("idle");
    expect(s1.currentId).toBeNull();
    expect(s1.isPlaying).toBe(false);
  });

  it("beginPlayback flips the countdown into playback", () => {
    const s0 = makeState({ currentId: "a", phase: "countdown", countdownEndsAt: NOW + 1000 });
    const s1 = applyCommand(s0, { kind: "beginPlayback" }, NOW);
    expect(s1.phase).toBe("playing");
    expect(s1.isPlaying).toBe(true);
    expect(s1.countdownEndsAt).toBeNull();
  });

  it("pause / resume toggle playback without losing the song", () => {
    const s0 = makeState({ currentId: "a", phase: "playing", isPlaying: true });
    const paused = applyCommand(s0, { kind: "pause" });
    expect(paused.isPlaying).toBe(false);
    expect(paused.currentId).toBe("a");
    const resumed = applyCommand(paused, { kind: "resume" });
    expect(resumed.isPlaying).toBe(true);
  });

  it("resume with nothing on stage starts the queue head", () => {
    const s0 = makeState({ queue: [{ songId: "a", singer: "Juan" }, { songId: "b", singer: "" }] });
    const s1 = applyCommand(s0, { kind: "resume" });
    expect(s1.currentId).toBe("a");
    expect(s1.currentSinger).toBe("Juan");
    expect(s1.isPlaying).toBe(true);
    expect(s1.phase).toBe("playing");
    expect(s1.queue).toEqual([{ songId: "b", singer: "" }]);
  });

  it("resume with an empty queue and nothing on stage is a no-op", () => {
    const s0 = makeState();
    expect(applyCommand(s0, { kind: "resume" })).toBe(s0);
  });

  it("beginScore holds the stage with a cosmetic score and a deadline", () => {
    const s0 = makeState({ currentId: "a", currentSinger: "Juan", phase: "playing", isPlaying: true, positionSec: 30 });
    const s1 = applyCommand(s0, { kind: "beginScore", seconds: 8 }, NOW, () => 1);
    expect(s1.phase).toBe("score");
    expect(s1.isPlaying).toBe(false);
    expect(s1.currentId).toBe("a");
    expect(s1.score).toEqual({ value: 100, reaction: "Ang galing!" });
    expect(s1.scoreEndsAt).toBe(NOW + 8000);
  });

  it("beginScore with nothing on stage returns to idle", () => {
    expect(applyCommand(makeState(), { kind: "beginScore", seconds: 8 }, NOW).phase).toBe("idle");
  });

  it("resume during the score phase starts the next queued song", () => {
    const s0 = makeState({
      currentId: "a",
      phase: "score",
      score: { value: 90, reaction: "Solid!" },
      scoreEndsAt: NOW,
      queue: [{ songId: "b", singer: "Ana" }],
    });
    const s1 = applyCommand(s0, { kind: "resume" }, NOW);
    expect(s1.currentId).toBe("b");
    expect(s1.currentSinger).toBe("Ana");
    expect(s1.phase).toBe("playing");
    expect(s1.score).toBeNull();
  });

  it("next clears the score and plays the queue head", () => {
    const s0 = makeState({
      currentId: "a",
      phase: "score",
      score: { value: 90, reaction: "Solid!" },
      queue: [{ songId: "b", singer: "" }],
    });
    const s1 = applyCommand(s0, { kind: "next" }, NOW);
    expect(s1.phase).toBe("playing");
    expect(s1.score).toBeNull();
    expect(s1.currentId).toBe("b");
  });

  it("reloadAll bumps the reload nonce so every client reloads", () => {
    const s0 = makeState({ reloadNonce: 2 });
    expect(applyCommand(s0, { kind: "reloadAll" }).reloadNonce).toBe(3);
  });

  it("stop clears the stage", () => {
    const s0 = makeState({ currentId: "a", phase: "playing", isPlaying: true, positionSec: 12 });
    const s1 = applyCommand(s0, { kind: "stop" });
    expect(s1.currentId).toBeNull();
    expect(s1.phase).toBe("idle");
    expect(s1.positionSec).toBe(0);
  });

  it("restart and seek bump the seek nonce (so the TV re-seeks)", () => {
    const s0 = makeState({ currentId: "a", phase: "playing", isPlaying: true, seekNonce: 3 });
    const restarted = applyCommand(s0, { kind: "restart" });
    expect(restarted.seekNonce).toBe(4);
    expect(restarted.positionSec).toBe(0);
    const sought = applyCommand(s0, { kind: "seek", sec: 30 });
    expect(sought.seekNonce).toBe(4);
    expect(sought.positionSec).toBe(30);
  });

  it("clamps volume to 0..1", () => {
    expect(applyCommand(makeState(), { kind: "setVolume", volume: 5 }).volume).toBe(1);
    expect(applyCommand(makeState(), { kind: "setVolume", volume: -1 }).volume).toBe(0);
  });

  it("ignores a progress report while paused", () => {
    const s0 = makeState({ isPlaying: false, positionSec: 5 });
    expect(applyCommand(s0, { kind: "progress", positionSec: 9 }).positionSec).toBe(5);
    const playing = applyCommand(makeState({ isPlaying: true }), { kind: "progress", positionSec: 9 });
    expect(playing.positionSec).toBe(9);
  });

  it("stores the host lyric offset", () => {
    expect(applyCommand(makeState(), { kind: "setLyricOffset", offsetSec: 0.5 }).lyricOffsetSec).toBe(0.5);
  });
});
