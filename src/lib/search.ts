// src/lib/search.ts
// Library filtering for the TV browse screen.
// A song matches when its title OR artist contains the trimmed, lowercased
// query; an empty/whitespace-only query returns the input unchanged.

import type { SongMeta } from "@/lib/scanner";

export function filterSongs(songs: SongMeta[], query: string): SongMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return songs;
  return songs.filter(
    (song) =>
      song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q),
  );
}
