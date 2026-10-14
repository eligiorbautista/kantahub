// tests/countdown.test.ts
import { describe, it, expect } from "vitest";
import { introCountdown } from "@/lib/lyrics";

const lines = [{ timeSec: 4, text: "A" }, { timeSec: 8, text: "B" }];

describe("introCountdown", () => {
  it("counts down to the first line", () => {
    expect(introCountdown(lines, 1)).toBe(3);
    expect(introCountdown(lines, 4)).toBeNull();
  });
  it("returns null with no lines", () => {
    expect(introCountdown([], 0)).toBeNull();
  });
});
