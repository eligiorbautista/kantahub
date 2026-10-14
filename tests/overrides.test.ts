// tests/overrides.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyOverrides,
  clearOverride,
  loadOverrides,
  resetOverridesCache,
  setOverride,
} from "@/lib/overrides";
import type { SongMeta } from "@/lib/scanner";

const tmp = mkdtempSync(path.join(os.tmpdir(), "kantahub-overrides-"));
process.env.INDEX_DIR = tmp;

const song = (id: string, title: string, artist: string, number?: string): SongMeta => ({
  id,
  title,
  artist,
  number,
  fileName: `${id}.mid`,
  type: "midi",
  hasLyrics: false,
});

beforeEach(() => {
  resetOverridesCache();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("applyOverrides", () => {
  it("returns the input unchanged with no overrides", () => {
    const songs = [song("a", "Title", "Artist")];
    expect(applyOverrides(songs, {})).toBe(songs);
  });

  it("lets an override win over parsed metadata", () => {
    const songs = [song("a", "Wrong", "Wrong")];
    const out = applyOverrides(songs, { a: { title: "Right", artist: "Real" } });
    expect(out[0].title).toBe("Right");
    expect(out[0].artist).toBe("Real");
  });

  it("can blank an artist without touching the title", () => {
    const out = applyOverrides([song("a", "T", "A")], { a: { artist: "" } });
    expect(out[0].title).toBe("T");
    expect(out[0].artist).toBe("");
  });
});

describe("setOverride / clearOverride", () => {
  it("persists and merges partial patches", async () => {
    await setOverride("a", { title: "New" });
    await setOverride("a", { artist: "Singer" });
    const map = await loadOverrides();
    expect(map.a).toEqual({ title: "New", artist: "Singer" });
  });

  it("drops a cleared field so parsed metadata shows again", async () => {
    await setOverride("a", { title: "New", artist: "Singer" });
    await setOverride("a", { title: "" });
    const map = await loadOverrides();
    expect(map.a).toEqual({ artist: "Singer" });
  });

  it("removes the entry entirely when everything is cleared", async () => {
    await setOverride("a", { title: "New" });
    const map = await clearOverride("a");
    expect(map.a).toBeUndefined();
  });
});
