// tests/lyrics.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractLyrics, activeLineIndex, type LyricLine } from "@/lib/lyrics";

const lines: LyricLine[] = [
  { timeSec: 0, text: "First" },
  { timeSec: 5, text: "Second" },
  { timeSec: 10, text: "Third" },
];

describe("activeLineIndex", () => {
  it("returns the line whose time has passed", () => {
    expect(activeLineIndex(lines, 0)).toBe(0);
    expect(activeLineIndex(lines, 6)).toBe(1);
    expect(activeLineIndex(lines, 99)).toBe(2);
  });
  it("returns -1 before the first line and for empty input", () => {
    expect(activeLineIndex(lines, -1)).toBe(-1);
    expect(activeLineIndex([], 5)).toBe(-1);
  });
});

const load = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

// Build a tiny format-0 MIDI whose single track holds the given lyric meta
// events (delta ticks must be < 128 each).
function buildKar(events: Array<{ delta: number; text: string }>): Buffer {
  const track: number[] = [];
  for (const ev of events) {
    track.push(ev.delta, 0xff, 0x05, ev.text.length, ...Buffer.from(ev.text, "utf8"));
  }
  track.push(0x00, 0xff, 0x2f, 0x00); // end of track
  const header = Buffer.concat([
    Buffer.from("MThd", "latin1"),
    Buffer.from([0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0]),
  ]);
  const mtrk = Buffer.concat([
    Buffer.from("MTrk", "latin1"),
    Buffer.from([0x00, 0x00, 0x00, track.length]),
    Buffer.from(track),
  ]);
  return Buffer.concat([header, mtrk]);
}

describe("extractLyrics", () => {
  it("collects lyric events converting absolute ticks via the injected callback", () => {
    const buf = buildKar([
      { delta: 0, text: "/Hello" },
      { delta: 96, text: "/World" },
    ]);
    expect(extractLyrics(buf, (t) => t / 48)).toEqual([
      { timeSec: 0, text: "Hello" },
      { timeSec: 2, text: "World" },
    ]);
  });

  it("merges consecutive fragments into display lines on / and \\n breaks", () => {
    const buf = buildKar([
      { delta: 0, text: "/" },
      { delta: 0, text: "Hel" },
      { delta: 0, text: "lo" },
      { delta: 24, text: "/Wor" },
      { delta: 0, text: "ld" },
    ]);
    expect(extractLyrics(buf, (t) => t / 48)).toEqual([
      { timeSec: 0, text: "Hello" },
      { timeSec: 0.5, text: "World" },
    ]);
  });

  it("drops whitespace-only entries", () => {
    const buf = buildKar([
      { delta: 0, text: "  " },
      { delta: 96, text: "Hey" },
      { delta: 96, text: "/" }, // trailing empty line must not appear
    ]);
    expect(extractLyrics(buf, (t) => t / 48)).toEqual([{ timeSec: 2, text: "Hey" }]);
  });

  it("merges every fragment when a file has no break markers", () => {
    const result = extractLyrics(load("with-lyrics.kar"), (t) => t / 480);
    expect(result).toEqual([{ timeSec: 0, text: "Test Song" }]);
  });

  it("returns [] for a MIDI with no lyric events", () => {
    expect(extractLyrics(load("instrumental.mid"), (t) => t)).toEqual([]);
  });

  it("does not throw on a corrupt buffer", () => {
    expect(() => extractLyrics(Buffer.from([0x00, 0x01, 0x02]), (t) => t)).not.toThrow();
    expect(extractLyrics(Buffer.from([0x00, 0x01, 0x02]), (t) => t)).toEqual([]);
  });
});
