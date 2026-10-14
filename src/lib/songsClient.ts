"use client";

// src/lib/songsClient.ts
// Browser-side song library helpers that talk to /api/songs. Search is paged
// server-side so the Songbook stays fast with a ~48k-song library; queue
// entries are resolved by id in one small request.
import type { SongMeta } from "@/lib/scanner";

export interface SongPage {
  total: number;
  items: SongMeta[];
}

export async function searchSongs(q: string, limit = 60, offset = 0): Promise<SongPage> {
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
  const res = await fetch(`/api/songs?${params.toString()}`);
  if (!res.ok) throw new Error(`song search failed: ${res.status}`);
  return (await res.json()) as SongPage;
}

export async function resolveSongs(ids: string[]): Promise<SongMeta[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams({ ids: ids.join(",") });
  const res = await fetch(`/api/songs?${params.toString()}`);
  if (!res.ok) throw new Error(`song resolve failed: ${res.status}`);
  return (await res.json()) as SongMeta[];
}

/** Exact song-number lookup (tolerates missing/extra leading zeros). */
export async function findByNumber(number: string): Promise<SongMeta | null> {
  const params = new URLSearchParams({ number });
  const res = await fetch(`/api/songs?${params.toString()}`);
  if (!res.ok) throw new Error(`song number lookup failed: ${res.status}`);
  const matches = (await res.json()) as SongMeta[];
  return matches[0] ?? null;
}

/** Display label: "Title — Artist", or just the title when there is no artist. */
export function songLabel(song: { title: string; artist: string }): string {
  return song.artist ? `${song.title} — ${song.artist}` : song.title;
}
