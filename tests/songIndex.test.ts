// tests/songIndex.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, copyFileSync, writeFileSync, mkdirSync, readdirSync, statSync, promises as fsPromises } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { vi } from "vitest";
import { getSongsIndex, invalidateSongsIndex, INDEX_VERSION } from "@/lib/songIndex";

const fixture = (n: string) => path.join(__dirname, "fixtures", "songs", n);

function makeDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "kantahub-idx-"));
  copyFileSync(fixture("with-lyrics.kar"), path.join(d, "with-lyrics.kar"));
  return d;
}

describe("getSongsIndex", () => {
  beforeEach(() => invalidateSongsIndex());

  it("builds once and returns the same result from cache", async () => {
    const d = makeDir();
    const a = await getSongsIndex(d);
    const b = await getSongsIndex(d);
    expect(a.length).toBe(1);
    expect(b).toEqual(a);
  });

  it("forces a rebuild when the dir changes", async () => {
    const d = makeDir();
    await getSongsIndex(d);
    copyFileSync(fixture("instrumental.mid"), path.join(d, "instrumental.mid"));
    invalidateSongsIndex(); // simulate signature change; explicit invalidation path
    const again = await getSongsIndex(d);
    expect(again.length).toBe(2);
  });

  it("returns [] for a missing dir and never throws", async () => {
    expect(await getSongsIndex(path.join(tmpdir(), "nope-kantahub"))).toEqual([]);
  });

  it("force:true ignores a stale persisted record even while a normal build is in flight", async () => {
    const d = makeDir();
    const idxDir = mkdtempSync(path.join(tmpdir(), "kantahub-idx-store-"));
    process.env.INDEX_DIR = idxDir;
    try {
      // Seed a persisted record matching the current signature but missing
      // the file that is actually on disk (flat dir: version:mtimeMs:count).
      const sig = `v${INDEX_VERSION}:${statSync(d).mtimeMs}:${readdirSync(d).length}`;
      const hash = createHash("sha1").update(path.resolve(d)).digest("hex");
      writeFileSync(
        path.join(idxDir, `songs-${hash}.json`),
        JSON.stringify({ songs: [], signature: sig, builtAt: Date.now() }),
      );
      const inflight = getSongsIndex(d); // resolves from the stale persisted record
      const forced = await getSongsIndex(d, { force: true }); // must re-parse the real dir
      expect(forced.length).toBe(1);
      expect((await inflight).length).toBe(0);
    } finally {
      delete process.env.INDEX_DIR;
    }
  });

  it("a failing subdir stat degrades the signature but never empties the index", async () => {
    const d = makeDir();
    mkdirSync(path.join(d, "sub"));
    copyFileSync(fixture("instrumental.mid"), path.join(d, "sub", "instrumental.mid"));
    const realStat = fsPromises.stat;
    vi.spyOn(fsPromises, "stat").mockImplementation((p: Parameters<typeof realStat>[0], ...rest: unknown[]) => {
      if (String(p).endsWith(`${path.sep}sub`)) return Promise.reject(new Error("simulated EACCES"));
      return realStat(p, ...(rest as []));
    });
    try {
      const songs = await getSongsIndex(d);
      expect(songs.length).toBe(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
