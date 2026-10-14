// tests/midiMeta.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readMidiInfo } from "@/lib/midiMeta";

const load = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

describe("readMidiInfo", () => {
  it("reads track-name meta as title and detects lyrics", () => {
    const info = readMidiInfo(load("with-lyrics.kar"));
    expect(info.title).toBe("Test Song");
    expect(info.hasLyrics).toBe(true);
  });
  it("reports hasLyrics false when no lyric events exist", () => {
    const info = readMidiInfo(load("instrumental.mid"));
    expect(info.hasLyrics).toBe(false);
  });
  it("does not throw on a corrupt buffer", () => {
    expect(() => readMidiInfo(Buffer.from([0x00, 0x01, 0x02]))).not.toThrow();
    expect(readMidiInfo(Buffer.from([0x00, 0x01, 0x02])).hasLyrics).toBe(false);
  });
});
