// tests/api.soundfont.test.ts
import { describe, it, expect } from "vitest";
import { findSoundfont } from "@/lib/soundfont";

describe("findSoundfont", () => {
  it("returns null for a missing sound dir", () => {
    expect(findSoundfont("/no/such/dir")).toBeNull();
  });
  it("returns null when no supported file exists", () => {
    expect(findSoundfont("tests/fixtures/empty-sound")).toBeNull();
  });
  it("finds a supported soundfont file", () => {
    expect(findSoundfont("tests/fixtures/sound")).toMatch(/\.sf2$/);
  });
});
