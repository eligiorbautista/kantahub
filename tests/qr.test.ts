// tests/qr.test.ts
import { describe, it, expect } from "vitest";
import { randomSessionId } from "@/lib/session";

describe("randomSessionId", () => {
  it("is an 8-char base36 string", () => {
    expect(randomSessionId()).toMatch(/^[0-9a-z]{8}$/);
  });
  it("is not constant across calls", () => {
    expect(randomSessionId()).not.toBe(randomSessionId());
  });
});
