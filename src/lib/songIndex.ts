// src/lib/songIndex.ts
// Cached library index. listSongs() walks and parses every file, which on a
// ~48k-file library takes ~60s — far too slow per request. This module builds
// the index once, caches it in memory, and persists it to disk so it also
// survives server restarts. Staleness is detected with a cheap fingerprint
// (dir mtime + entry count) that never reads individual song files.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSongs, type SongMeta } from "@/lib/scanner";

export type SongsSource = { kind: "dir"; dir: string };

interface IndexEntry {
  songs: SongMeta[];
  signature: string;
  builtAt: number;
}

// In-memory cache keyed by resolved absolute songsDir.
const memory = new Map<string, IndexEntry>();
// Concurrent cold builds deduplicated per resolved songsDir.
const building = new Map<string, Promise<SongMeta[]>>();

const MISSING = "__missing__";

export function defaultSongsDir(): string {
  return process.env.SONGS_DIR ?? "/songs";
}

function indexDir(): string {
  return process.env.INDEX_DIR ?? path.join(os.tmpdir(), "kantahub-index");
}

// One JSON file per songsDir, named by a hash of the resolved absolute path.
function indexFile(resolvedDir: string): string {
  const hash = createHash("sha1").update(resolvedDir).digest("hex");
  return path.join(indexDir(), `songs-${hash}.json`);
}

// Cheap staleness fingerprint: dir mtimeMs plus the entry count from a single
// non-recursive readdir, plus the mtime of each immediate subdirectory (one
// stat each — the real library nests its files one level deep, and a subdir
// mtime bumps when its contents change). Changes nested >1 level deep are an
// accepted limitation: use force/invalidate or restart to pick those up.
// Returns null when the dir cannot be read.
async function signature(dir: string): Promise<string | null> {
  try {
    const stat = await fs.stat(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const parts = [`${stat.mtimeMs}:${entries.length}`];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        parts.push(`${entry.name}:${(await fs.stat(path.join(dir, entry.name))).mtimeMs}`);
      }
    }
    return parts.join("|");
  } catch {
    return null;
  }
}

async function loadPersisted(file: string, sig: string): Promise<IndexEntry | null> {
  try {
    const record: IndexEntry = JSON.parse(await fs.readFile(file, "utf8"));
    if (record && record.signature === sig && Array.isArray(record.songs)) {
      return record;
    }
  } catch {
    // No persisted index or unreadable/corrupt file: rebuild instead.
  }
  return null;
}

async function persist(file: string, entry: IndexEntry): Promise<void> {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(entry), "utf8");
  } catch {
    // Persistence is best-effort; the in-memory cache still serves requests.
  }
}

async function build(resolvedDir: string, skipPersisted: boolean): Promise<SongMeta[]> {
  const inflight = building.get(resolvedDir);
  if (inflight) return inflight;
  const promise = (async () => {
    const sig = await signature(resolvedDir);
    if (sig === null) {
      // Missing/unreadable songs dir: cache the empty result, never throw.
      memory.set(resolvedDir, { songs: [], signature: MISSING, builtAt: Date.now() });
      return [] as SongMeta[];
    }
    const file = indexFile(resolvedDir);
    // A forced rebuild re-parses the files instead of trusting the
    // persisted record, even when the signature still matches.
    const cached = skipPersisted ? null : await loadPersisted(file, sig);
    if (cached) {
      memory.set(resolvedDir, cached);
      return cached.songs;
    }
    const entry: IndexEntry = { songs: await listSongs(resolvedDir), signature: sig, builtAt: Date.now() };
    memory.set(resolvedDir, entry);
    await persist(file, entry);
    return entry.songs;
  })().finally(() => building.delete(resolvedDir));
  building.set(resolvedDir, promise);
  return promise;
}

// Returns the cached index for songsDir, building it (via listSongs) only
// when the cache is cold or stale. opts.force rebuilds unconditionally.
export async function getSongsIndex(songsDir: string, opts?: { force?: boolean }): Promise<SongMeta[]> {
  const resolvedDir = path.resolve(songsDir);
  if (!opts?.force && memory.has(resolvedDir)) {
    const sig = await signature(resolvedDir);
    const entry = memory.get(resolvedDir)!;
    if ((sig === null ? MISSING : sig) === entry.signature) {
      return entry.songs;
    }
  }
  return build(resolvedDir, opts?.force === true);
}

// Drops the in-memory and persisted cache, for one songsDir or for all.
export function invalidateSongsIndex(songsDir?: string): void {
  if (songsDir !== undefined) {
    const resolvedDir = path.resolve(songsDir);
    memory.delete(resolvedDir);
    void fs.rm(indexFile(resolvedDir), { force: true }).catch(() => {});
    return;
  }
  memory.clear();
  void (async () => {
    try {
      const dir = indexDir();
      for (const name of await fs.readdir(/*turbopackIgnore: true*/ dir)) {
        if (name.startsWith("songs-") && name.endsWith(".json")) {
          await fs.rm(path.join(dir, name), { force: true });
        }
      }
    } catch {
      // Index dir may not exist yet; nothing to invalidate on disk.
    }
  })();
}

// Builds/caches the index without throwing (used at server startup).
export async function warmSongsIndex(songsDir?: string): Promise<void> {
  try {
    await getSongsIndex(songsDir ?? defaultSongsDir());
  } catch (err) {
    console.warn("kantahub: failed to warm songs index:", err);
  }
}
