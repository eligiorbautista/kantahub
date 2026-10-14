// src/lib/overrides.ts
// Manual metadata overrides for the song library. The host can fix a displayed
// title/artist/number for a file; the override is stored in a small JSON file
// next to the cached index and re-applied on every read, so it survives a
// rescan (the final priority is: manual override → parsed filename → embedded
// MIDI metadata).
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SongMeta } from "@/lib/scanner";

export interface SongOverride {
  title?: string;
  artist?: string;
  number?: string;
}

export type OverrideMap = Record<string, SongOverride>;

function overridesFile(): string {
  const dir = process.env.INDEX_DIR ?? path.join(os.tmpdir(), "kantahub-index");
  return path.join(dir, "overrides.json");
}

let cache: OverrideMap | null = null;

export async function loadOverrides(): Promise<OverrideMap> {
  if (cache) return cache;
  try {
    const raw: unknown = JSON.parse(await fs.readFile(overridesFile(), "utf8"));
    cache = raw && typeof raw === "object" ? (raw as OverrideMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export async function saveOverrides(next: OverrideMap): Promise<void> {
  cache = next;
  try {
    await fs.mkdir(path.dirname(overridesFile()), { recursive: true });
    await fs.writeFile(overridesFile(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    // Persistence is best-effort; the in-memory cache still serves the session.
  }
}

export async function setOverride(id: string, patch: SongOverride): Promise<OverrideMap> {
  const current = await loadOverrides();
  const merged: SongOverride = { ...current[id], ...patch };
  // Drop keys the host cleared so the parsed value shows through again.
  (Object.keys(merged) as Array<keyof SongOverride>).forEach((k) => {
    if (merged[k] !== undefined && merged[k]!.trim() === "") delete merged[k];
  });
  const next: OverrideMap = { ...current };
  if (Object.keys(merged).length === 0) delete next[id];
  else next[id] = merged;
  await saveOverrides(next);
  return next;
}

export async function clearOverride(id: string): Promise<OverrideMap> {
  const current = await loadOverrides();
  const next = { ...current };
  delete next[id];
  await saveOverrides(next);
  return next;
}

/** Apply overrides on top of parsed metadata (override wins). */
export function applyOverrides(songs: SongMeta[], overrides: OverrideMap): SongMeta[] {
  if (Object.keys(overrides).length === 0) return songs;
  return songs.map((song) => {
    const o = overrides[song.id];
    if (!o) return song;
    return {
      ...song,
      title: o.title?.trim() || song.title,
      artist: o.artist !== undefined ? o.artist.trim() : song.artist,
      number: o.number?.trim() || song.number,
    };
  });
}

/** Test-only: drop the in-memory cache. */
export function resetOverridesCache(): void {
  cache = null;
}
