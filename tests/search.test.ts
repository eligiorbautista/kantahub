import { describe, it, expect } from "vitest";
import { filterSongs } from "@/lib/search";

const songs = [
  { title: "Dancing Queen", artist: "ABBA" },
  { title: "Bad", artist: "Michael Jackson" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spec test shape (partial SongMeta)
] as any;

describe("filterSongs", () => {
  it("matches title or artist, case-insensitive", () => {
    expect(filterSongs(songs, "abba").map(s => s.title)).toEqual(["Dancing Queen"]);
    expect(filterSongs(songs, "bad").map(s => s.title)).toEqual(["Bad"]);
  });
  it("returns all songs for an empty query", () => {
    expect(filterSongs(songs, "")).toEqual(songs);
  });
});
