// tests/autoAdvance.test.ts
import { describe, it, expect } from "vitest";
import { nextAfter } from "@/lib/autoAdvance";

describe("nextAfter", () => {
  it("returns the queue head", () => {
    expect(nextAfter("a", ["b", "c"])).toBe("b");
  });
  it("returns null when the queue is empty", () => {
    expect(nextAfter("a", [])).toBeNull();
  });
});
