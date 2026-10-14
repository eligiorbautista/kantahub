// tests/score.test.ts
import { describe, it, expect } from "vitest";
import { rollScore } from "@/lib/score";

describe("rollScore", () => {
  it("stays within 70..100 for many samples", () => {
    for (let i = 0; i < 1000; i++) {
      const { score } = rollScore(Math.random);
      expect(score).toBeGreaterThanOrEqual(70);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
  it("biases high (mean above 85)", () => {
    let sum = 0;
    for (let i = 0; i < 5000; i++) sum += rollScore(Math.random).score;
    expect(sum / 5000).toBeGreaterThan(85);
  });
  it("returns a reaction string", () => {
    expect(typeof rollScore(() => 0).reaction).toBe("string");
  });
});
