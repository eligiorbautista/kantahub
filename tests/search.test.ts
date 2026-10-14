import { describe, it, expect } from "vitest";
import { filterSongs } from "@/lib/search";

const songs = [
  { title: "Dancing Queen", artist: "ABBA" },
  { title: "Bad", artist: "Michael Jackson" },
  { title: "Trust in Me", artist: "Francesca Beghe", number: "000001" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spec test shape (partial SongMeta)
] as any;

describe("filterSongs", () => {
  it("matches title or artist, case-insensitive", () => {
    expect(filterSongs(songs, "abba").map(s => s.title)).toEqual(["Dancing Queen"]);
    expect(filterSongs(songs, "bad").map(s => s.title)).toEqual(["Bad"]);
  });
  it("matches by song number", () => {
    expect(filterSongs(songs, "000001").map(s => s.title)).toEqual(["Trust in Me"]);
  });
  it("returns all songs for an empty query", () => {
    expect(filterSongs(songs, "")).toEqual(songs);
  });
});
