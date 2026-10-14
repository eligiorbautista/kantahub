// tests/m3u.test.ts
import { describe, it, expect } from "vitest";
import { parseM3U, resolveM3U } from "@/lib/m3u";
import type { SongMeta } from "@/lib/scanner";

describe("parseM3U", () => {
  it("returns only non-comment, non-empty lines", () => {
    const text = "#EXTM3U\n#EXTINF:123,ABBA\nABBA - Dancing Queen.kar\n\nBad.mid\n";
    expect(parseM3U(text)).toEqual(["ABBA - Dancing Queen.kar", "Bad.mid"]);
  });
  it("handles CRLF and empty input", () => {
    expect(parseM3U("a.mid\r\nb.kar\r\n")).toEqual(["a.mid", "b.kar"]);
    expect(parseM3U("")).toEqual([]);
  });
  it("trims line whitespace and strips a leading BOM", () => {
    expect(parseM3U("\uFEFF#EXTM3U\n  ABBA - Dancing Queen.kar  \n")).toEqual([
      "ABBA - Dancing Queen.kar",
    ]);
  });
});

const songs: SongMeta[] = [
  { id: "dancing", title: "Dancing Queen", artist: "ABBA", fileName: "ABBA - Dancing Queen.kar", type: "kar", hasLyrics: true },
  { id: "bad", title: "Bad", artist: "", fileName: "sub/Bad.mid", type: "midi", hasLyrics: false },
];

describe("resolveM3U", () => {
  it("resolves entries by file name and drops unknown ones", () => {
    expect(resolveM3U(["ABBA - Dancing Queen.kar", "Missing Song.mid"], songs)).toEqual(["dancing"]);
  });
  it("matches by basename of any absolute or nested path, case-insensitively", () => {
    expect(
      resolveM3U(["C:\\Users\\karaoke\\ABBA - DANCING QUEEN.kar", "/music/sub/Bad.MID"], songs),
    ).toEqual(["dancing", "bad"]);
  });
  it("matches by title with or without a karaoke extension", () => {
    expect(resolveM3U(["Dancing Queen", "Bad.kar"], songs)).toEqual(["dancing", "bad"]);
  });
  it("returns [] for empty inputs", () => {
    expect(resolveM3U([], songs)).toEqual([]);
    expect(resolveM3U(["nope.mid"], [])).toEqual([]);
  });
  it("prefers the file-name match and keeps the first song when titles collide", () => {
    const dupes: SongMeta[] = [
      { id: "one", title: "Song", artist: "A", fileName: "000001 - Song - A.mid", type: "midi", hasLyrics: false },
      { id: "two", title: "Song", artist: "B", fileName: "000002 - Song - B.mid", type: "midi", hasLyrics: false },
    ];
    expect(resolveM3U(["000002 - Song - B.mid", "Song"], dupes)).toEqual(["two", "one"]);
  });
});
