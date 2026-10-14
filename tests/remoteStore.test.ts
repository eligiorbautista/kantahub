// tests/remoteStore.test.ts
import { describe, it, expect, vi } from "vitest";
import { getSession, updateSession, subscribe } from "@/lib/remoteStore";

describe("remoteStore", () => {
  it("creates and updates a session, notifying subscribers", () => {
    const cb = vi.fn();
    const unsub = subscribe("s1", cb);
    updateSession("s1", { isPlaying: true });
    expect(getSession("s1").isPlaying).toBe(true);
    expect(cb).toHaveBeenCalled();
    unsub();
  });
});
