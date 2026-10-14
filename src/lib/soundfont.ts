// src/lib/soundfont.ts
// Locates the SoundFont file the browser synth loads: the first file
// with a supported extension (*.sf2, *.sf3, *.sfogg, *.dls) inside the
// configured sound directory.

import { readdirSync } from "node:fs";
import path from "node:path";

const SUPPORTED_EXT = [".sf2", ".sf3", ".sfogg", ".dls"];

// Return the full path of the first supported soundfont file in dir
// (case-insensitive extension match, directory listing order), or null
// when the directory is missing, empty, or holds no supported file.
// Never throws.
export function findSoundfont(dir: string): string | null {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_EXT.includes(ext)) return path.join(dir, entry.name);
  }
  return null;
}
