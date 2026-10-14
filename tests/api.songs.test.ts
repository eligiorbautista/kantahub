// tests/api.songs.test.ts
import { describe, it, expect } from "vitest";
import { listSongs } from "@/lib/scanner";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "songs");

describe("library listing", () => {
  it("lists supported files and skips others", async () => {
    const songs = await listSongs(dir);
    expect(songs.length).toBeGreaterThan(0);
    expect(songs.every(s => ["midi", "kar"].includes(s.type))).toBe(true);
  });
  it("returns [] for a missing directory", async () => {
    expect(await listSongs(path.join(path.dirname(fileURLToPath(import.meta.url)), "does-not-exist"))).toEqual([]);
  });
});
