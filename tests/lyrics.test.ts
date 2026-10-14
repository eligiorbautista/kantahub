// tests/lyrics.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractLyrics, activeLineIndex, interludeInfo, type LyricLine } from "@/lib/lyrics";

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

describe("interludeInfo", () => {
  const withGap: LyricLine[] = [
    { timeSec: 0, endSec: 2, text: "One" },
    { timeSec: 20, endSec: 22, text: "Two" }, // 18s of instrumental after line one
  ];

  it("is inactive while a line is still being sung", () => {
    expect(interludeInfo(withGap, 1).active).toBe(false);
  });

  it("ignores short breaths between lines", () => {
    const shortGap: LyricLine[] = [
      { timeSec: 0, endSec: 2, text: "One" },
      { timeSec: 5, endSec: 6, text: "Two" },
    ];
    expect(interludeInfo(shortGap, 3).active).toBe(false);
  });

  it("is active in a long break and reports the time to the next line", () => {
    const info = interludeInfo(withGap, 10);
    expect(info.active).toBe(true);
    expect(info.untilNextSec).toBe(10);
  });

  it("does not fire immediately after the last syllable", () => {
    expect(interludeInfo(withGap, 2.2).active).toBe(false);
  });

  it("is inactive before the first line and after the last", () => {
    expect(interludeInfo(withGap, -1).active).toBe(false);
    expect(interludeInfo(withGap, 25).active).toBe(false);
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

// The line-splitting tests care about the display text and start time; the
// syllable end time is asserted separately.
const simple = (ls: LyricLine[]) => ls.map(({ timeSec, text }) => ({ timeSec, text }));

describe("extractLyrics", () => {
  it("collects lyric events converting absolute ticks via the injected callback", () => {
    const buf = buildKar([
      { delta: 0, text: "/Hello" },
      { delta: 96, text: "/World" },
    ]);
    expect(simple(extractLyrics(buf, (t) => t / 48))).toEqual([
      { timeSec: 0, text: "Hello" },
      { timeSec: 2, text: "World" },
    ]);
  });

  it("records the last syllable time as endSec", () => {
    const buf = buildKar([
      { delta: 0, text: "Hel" },
      { delta: 24, text: "lo\n" },
      { delta: 96, text: "Wor" },
      { delta: 24, text: "ld\n" },
    ]);
    const out = extractLyrics(buf, (t) => t / 24);
    expect(out[0]).toMatchObject({ timeSec: 0, endSec: 1 });
    expect(out[1]).toMatchObject({ timeSec: 5, endSec: 6 });
  });

  it("merges consecutive fragments into display lines on / and \\n breaks", () => {
    const buf = buildKar([
      { delta: 0, text: "/" },
      { delta: 0, text: "Hel" },
      { delta: 0, text: "lo" },
      { delta: 24, text: "/Wor" },
      { delta: 0, text: "ld" },
    ]);
    expect(simple(extractLyrics(buf, (t) => t / 48))).toEqual([
      { timeSec: 0, text: "Hello" },
      { timeSec: 0.5, text: "World" },
    ]);
  });

  it("treats a leading \\r\\n fragment as a line break", () => {
    const buf = buildKar([
      { delta: 0, text: "One" },
      { delta: 96, text: "\r\nTwo" },
      { delta: 96, text: "\r\nThree" },
    ]);
    expect(simple(extractLyrics(buf, (t) => t / 48))).toEqual([
      { timeSec: 0, text: "One" },
      { timeSec: 2, text: "Two" },
      { timeSec: 4, text: "Three" },
    ]);
  });

  it("treats a lone leading \\r as a line break", () => {
    const buf = buildKar([
      { delta: 0, text: "One" },
      { delta: 96, text: "\rTwo" },
    ]);
    expect(simple(extractLyrics(buf, (t) => t / 48))).toEqual([
      { timeSec: 0, text: "One" },
      { timeSec: 2, text: "Two" },
    ]);
  });

  it("flushes a line when its final fragment carries a trailing newline", () => {
    // Soft Karaoke convention: the newline rides on the LAST fragment of a
    // line, so "lo\n" completes "Hello" instead of starting a new line.
    const buf = buildKar([
      { delta: 0, text: "Hel" },
      { delta: 24, text: "lo\n" },
      { delta: 24, text: "Wor" },
      { delta: 24, text: "ld\n" },
    ]);
    expect(simple(extractLyrics(buf, (t) => t / 24))).toEqual([
      { timeSec: 0, text: "Hello" },
      { timeSec: 2, text: "World" },
    ]);
  });

  it("drops whitespace-only entries", () => {
    const buf = buildKar([
      { delta: 0, text: "  " },
      { delta: 96, text: "Hey" },
      { delta: 96, text: "/" }, // trailing empty line must not appear
    ]);
    expect(simple(extractLyrics(buf, (t) => t / 48))).toEqual([{ timeSec: 2, text: "Hey" }]);
  });

  it("merges every fragment when a file has no break markers", () => {
    const result = extractLyrics(load("with-lyrics.kar"), (t) => t / 480);
    expect(simple(result)).toEqual([{ timeSec: 0, text: "Test Song" }]);
  });

  it("returns [] for a MIDI with no lyric events", () => {
    expect(extractLyrics(load("instrumental.mid"), (t) => t)).toEqual([]);
  });

  it("does not throw on a corrupt buffer", () => {
    expect(() => extractLyrics(Buffer.from([0x00, 0x01, 0x02]), (t) => t)).not.toThrow();
    expect(extractLyrics(Buffer.from([0x00, 0x01, 0x02]), (t) => t)).toEqual([]);
  });
});
