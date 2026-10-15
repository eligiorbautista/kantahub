// tests/music.test.ts
// The `music/` volume feeds the idle background music and the score cheer. The
// listing has to be forgiving: the folder is optional, may be empty, and mixes
// the cheer in with the idle tracks.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isCheerFile, listMusic, musicContentType } from "@/lib/music";

function dirWith(files: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "kantahub-music-"));
  for (const name of files) writeFileSync(path.join(dir, name), "x");
  return dir;
}

describe("isCheerFile", () => {
  it("treats anything starting with cheer as the cheer", () => {
    expect(isCheerFile("cheer.mp3")).toBe(true);
    expect(isCheerFile("Cheer-crowd.wav")).toBe(true);
  });
  it("leaves idle tracks alone", () => {
    expect(isCheerFile("lofi-01.mp3")).toBe(false);
    expect(isCheerFile("applause.mp3")).toBe(false);
  });
});

describe("listMusic", () => {
  it("returns an empty listing for a missing folder", async () => {
    expect(await listMusic(path.join(tmpdir(), "kantahub-no-music"))).toEqual({ idle: [], cheer: null });
  });

  it("separates the cheer from the idle tracks and ignores other files", async () => {
    const dir = dirWith(["b.mp3", "a.mp3", "cheer.mp3", "notes.txt", "cover.jpg"]);
    const list = await listMusic(dir);
    expect(list.idle).toEqual(["a.mp3", "b.mp3"]);
    expect(list.cheer).toBe("cheer.mp3");
  });

  it("has no cheer when none is present", async () => {
    const list = await listMusic(dirWith(["one.mp3", "two.ogg"]));
    expect(list.cheer).toBeNull();
    expect(list.idle).toEqual(["one.mp3", "two.ogg"]);
  });

  it("picks one cheer deterministically when several exist", async () => {
    const list = await listMusic(dirWith(["cheer-b.mp3", "cheer-a.mp3"]));
    expect(list.cheer).toBe("cheer-a.mp3");
  });

  it("ignores dotfiles and directories", async () => {
    const dir = dirWith([".hidden.mp3", "real.mp3"]);
    expect((await listMusic(dir)).idle).toEqual(["real.mp3"]);
  });
});

describe("musicContentType", () => {
  it("maps the common audio extensions", () => {
    expect(musicContentType("a.mp3")).toBe("audio/mpeg");
    expect(musicContentType("a.M4A")).toBe("audio/mp4");
    expect(musicContentType("a.ogg")).toBe("audio/ogg");
    expect(musicContentType("a.wav")).toBe("audio/wav");
    expect(musicContentType("a.flac")).toBe("audio/flac");
    expect(musicContentType("a.weird")).toBe("application/octet-stream");
  });
});
