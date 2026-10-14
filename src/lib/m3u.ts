// src/lib/m3u.ts
// Pure M3U playlist helpers. Framework-free (no fs, no React, no next
// imports) so they can be unit-tested in plain node (tests/m3u.test.ts).

import type { SongMeta } from "@/lib/scanner";

// The extensions the scanner indexes; used to strip an entry's file
// extension before comparing it against song titles.
const KAR_EXT = /\.(mid|midi|kar)$/i;

// Parses an M3U playlist body and returns the referenced file paths/names:
// one entry per non-comment, non-empty line, original order preserved.
// `#`-prefixed lines (#EXTM3U, #EXTINF, ...) and blank lines are ignored;
// CRLF, lone CR and LF endings all work; surrounding whitespace is trimmed
// and a leading UTF-8 BOM (some editors save one) is stripped.
export function parseM3U(text: string): string[] {
  const names: string[] = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const name = line.trim();
    if (name && !name.startsWith("#")) {
      names.push(name);
    }
  }
  return names;
}

// Lowercased basename of a path that may use POSIX or Windows separators,
// so entries recorded on any machine ("C:\Music\Song.mid", "/music/Song.mid"
// or a bare "Song.mid") all compare against the same key.
function baseName(name: string): string {
  const parts = name.split(/[/\\]/);
  return parts[parts.length - 1].trim().toLowerCase();
}

// Resolves playlist entries to ids of known songs. An entry matches when
// either its basename equals a song's fileName basename (the common case:
// a playlist exported from any machine that shares the library's file
// names), or — failing that — when the entry minus a .mid/.midi/.kar
// extension equals a song's title (hand-written or title-based playlists).
// Comparisons are case-insensitive and directory prefixes are ignored.
// Entries matching nothing are dropped; resolved ids keep the entries'
// order (two entries resolving to the same song yield that id twice). When
// several songs share a key (duplicate titles, same file name in different
// subfolders) the first song in `songs` wins.
export function resolveM3U(names: string[], songs: SongMeta[]): string[] {
  const byFileName = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const song of songs) {
    const file = baseName(song.fileName);
    if (!byFileName.has(file)) {
      byFileName.set(file, song.id);
    }
    const title = song.title.trim().toLowerCase();
    if (title && !byTitle.has(title)) {
      byTitle.set(title, song.id);
    }
  }
  const resolved: string[] = [];
  for (const name of names) {
    const base = baseName(name);
    const id = byFileName.get(base) ?? byTitle.get(base.replace(KAR_EXT, ""));
    if (id) {
      resolved.push(id);
    }
  }
  return resolved;
}
