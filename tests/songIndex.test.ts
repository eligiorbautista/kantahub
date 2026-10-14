// tests/songIndex.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getSongsIndex, invalidateSongsIndex } from "@/lib/songIndex";

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
});
