// tests/scanner.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deriveFromFilename, parseSongFile } from "@/lib/scanner";

const load = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

describe("deriveFromFilename", () => {
  it("splits 'Artist - Title'", () => {
    expect(deriveFromFilename("ABBA - Dancing Queen.kar"))
      .toEqual({ artist: "ABBA", title: "Dancing Queen" });
  });
  it("falls back to whole name when there is no separator", () => {
    expect(deriveFromFilename("random_song.mid"))
      .toEqual({ artist: "", title: "random_song" });
  });
});

describe("parseSongFile", () => {
  it("prefers embedded title but keeps filename artist", () => {
    const buf = load("with-lyrics.kar"); // real fixture bytes
    const s = parseSongFile("ABBA - Dancing Queen.kar", buf);
    expect(s.type).toBe("kar");
    expect(s.title).toBe("Test Song");   // embedded wins
    expect(s.artist).toBe("ABBA");       // filename artist kept
    expect(s.hasLyrics).toBe(true);
    expect(s.id).toBeTruthy();
  });
});
