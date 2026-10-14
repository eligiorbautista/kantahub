// src/lib/scanner.ts
// Scans a songs directory for MIDI/KAR files and builds their metadata.
// When the filename follows a "Title - Artist" / "N - Title - Artist" scheme it
// is authoritative for the title and artist; embedded MIDI metadata is used only
// as a fallback (karaoke MIDI track names are frequently generic instrument
// labels like "Melody"/"BASS"/"DRUM", not the song title). Lyrics detection
// always comes from the embedded MIDI data.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readMidiInfo } from "@/lib/midiMeta";

export type SongType = "midi" | "kar";

export interface SongMeta {
  id: string;
  /** Song number parsed from the filename (e.g. "00123"), when present. */
  number?: string;
  title: string;
  artist: string;
  fileName: string;
  type: SongType;
  hasLyrics: boolean;
  error?: boolean;
}

const SUPPORTED_EXT = /\.(mid|midi|kar)$/i;

export interface FilenameInfo {
  number?: string;
  title: string;
  artist: string;
}

// Parse a song filename into number/title/artist.
//
// Supported shapes (the artist is always the LAST segment, the title everything
// before it, and a leading song number is stripped):
//   "00123 - My Way - Frank Sinatra.mid"  -> #00123, "My Way", "Frank Sinatra"
//   "Kahit Maputi Na Ang Buhok Ko - Rey Valera.mid" -> "Kahit ...", "Rey Valera"
//   "Title - Singer.mid"                   -> "Title", "Singer"
//   "filename.mid"                         -> "filename", ""
//
// Underscores become spaces, whitespace runs collapse, and extra hyphens inside
// a title are preserved (the split is on a spaced hyphen, not the first hyphen).
// Non-ASCII (Tagalog) characters are preserved.
export function deriveFromFilename(fileName: string): FilenameInfo {
  const base = path.basename(fileName).replace(/\.[^.]+$/, "");
  const normalized = base.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return { title: base.trim(), artist: "" };

  // Strip a leading song number, with or without a separator.
  let body = normalized;
  let number: string | undefined;
  const lead = body.match(/^(\d{1,7})\s*(?:[-–—]\s*|\s+)(.+)$/);
  if (lead) {
    number = lead[1];
    body = lead[2].trim();
  }

  const parts = body
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return { title: number ?? normalized, artist: "", number };
  if (parts.length === 1) return { title: parts[0], artist: "", number };
  // "Title - Singer": artist is the last segment; the title keeps any earlier
  // hyphens (do not blindly split on the first hyphen).
  return {
    title: parts.slice(0, -1).join(" - "),
    artist: parts[parts.length - 1],
    number,
  };
}

// Build metadata for one song file. fileName is the path relative to the
// songs root (or a bare name), used for the stable id and title fallback.
export function parseSongFile(fileName: string, buf: Buffer): SongMeta {
  const { title: fileTitle, artist, number } = deriveFromFilename(fileName);
  const type: SongType = fileName.toLowerCase().endsWith(".kar") ? "kar" : "midi";
  const id = createHash("sha1").update(fileName).digest("hex").slice(0, 12);
  // A filename that carries a title/artist separator (or a song number) is
  // trusted for the title: karaoke MIDI files commonly name their first track
  // generically ("Melody"), which is not the song title. Only a bare filename
  // with no structure falls back to embedded MIDI metadata.
  const base = path.basename(fileName).replace(/\.[^.]+$/, "");
  const filenameHasStructure = number !== undefined || /\s+[-–—]\s+/.test(base.replace(/_/g, " "));
  try {
    const info = readMidiInfo(buf);
    return {
      id,
      number,
      title: filenameHasStructure ? fileTitle : info.title ?? fileTitle,
      artist,
      fileName,
      type,
      hasLyrics: info.hasLyrics,
    };
  } catch {
    // Parse blew up entirely: keep the song listed with filename fallback.
    return { id, number, title: fileTitle, artist, fileName, type, hasLyrics: false, error: true };
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
