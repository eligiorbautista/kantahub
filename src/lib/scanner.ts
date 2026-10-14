// src/lib/scanner.ts
// Scans a songs directory for MIDI/KAR files and builds their metadata.
// Embedded MIDI metadata (title, lyrics) is preferred over the filename,
// while the artist always comes from the "Artist - Title" filename scheme.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readMidiInfo } from "@/lib/midiMeta";

export type SongType = "midi" | "kar";

export interface SongMeta {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  type: SongType;
  hasLyrics: boolean;
  error?: boolean;
}

const SUPPORTED_EXT = /\.(mid|midi|kar)$/i;

// Split "Artist - Title.ext" on the first " - "; without a separator the
// whole base name is the title and the artist is empty.
export function deriveFromFilename(fileName: string): { title: string; artist: string } {
  const base = path.basename(fileName).replace(/\.[^.]+$/, "");
  const idx = base.indexOf(" - ");
  if (idx === -1) return { title: base.trim(), artist: "" };
  return { title: base.slice(idx + 3).trim(), artist: base.slice(0, idx).trim() };
}

// Build metadata for one song file. fileName is the path relative to the
// songs root (or a bare name), used for the stable id and title fallback.
export function parseSongFile(fileName: string, buf: Buffer): SongMeta {
  const { title: fileTitle, artist } = deriveFromFilename(fileName);
  const type: SongType = fileName.toLowerCase().endsWith(".kar") ? "kar" : "midi";
  const id = createHash("sha1").update(fileName).digest("hex").slice(0, 12);
  try {
    const info = readMidiInfo(buf);
    return {
      id,
      title: info.title ?? fileTitle,
      artist,
      fileName,
      type,
      hasLyrics: info.hasLyrics,
    };
  } catch {
    // Parse blew up entirely: keep the song listed with filename fallback.
    return { id, title: fileTitle, artist, fileName, type, hasLyrics: false, error: true };
  }
}

// Recursively list songs under songsDir. A missing or unreadable directory
// yields [] (never throws); a file that fails to read is skipped so one bad
// file cannot break the whole library.
export async function listSongs(songsDir: string): Promise<SongMeta[]> {
  return walk(songsDir, "");
}

async function walk(dir: string, relDir: string): Promise<SongMeta[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const songs: SongMeta[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    // Keep the path relative to the scanned root as fileName so the
    // streaming route can locate files in nested directories and ids
    // stay unique across subfolders.
    const relName = relDir ? path.join(relDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      songs.push(...(await walk(fullPath, relName)));
      continue;
    }
    if (!entry.isFile() || !SUPPORTED_EXT.test(entry.name)) continue;
    try {
      const buf = await fs.readFile(fullPath);
      songs.push(parseSongFile(relName, buf));
    } catch {
      // Skip files that fail to read entirely.
    }
  }
  return songs;
}
