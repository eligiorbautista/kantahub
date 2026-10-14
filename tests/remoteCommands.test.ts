// tests/remoteCommands.test.ts
import { describe, it, expect } from "vitest";
import { applyCommand } from "@/lib/remoteCommands";

const base = { session: "s", queue: [], currentId: null, isPlaying: false, positionSec: 0 };

describe("applyCommand", () => {
  it("enqueues without duplicates", () => {
    let s = applyCommand(base, { kind: "enqueue", songId: "a" });
    s = applyCommand(s, { kind: "enqueue", songId: "a" });
    expect(s.queue).toEqual(["a"]);
  });
  it("plays removes the current from the queue head", () => {
    const q = applyCommand({ ...base, queue: ["a", "b"] }, { kind: "play", songId: "a" });
    expect(q.currentId).toBe("a");
    expect(q.isPlaying).toBe(true);
    expect(q.queue).toEqual(["b"]);
  });
  it("next advances to the queue head", () => {
    const n = applyCommand({ ...base, queue: ["b"], currentId: "a", isPlaying: true }, { kind: "next" });
    expect(n.currentId).toBe("b");
  });
});
