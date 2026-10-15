// src/lib/music.ts
// The optional `music/` volume: background music for the idle screen, and the
// cheer that plays with the post-song score.
//
// Files are read live from disk (like background media), so dropping an MP3 into
// the folder is enough — no rebuild, no restart. Convention:
//   music/cheer.mp3      -> the cheering sound (any name starting with "cheer")
//   music/<anything>.mp3 -> idle background music, played shuffled
export interface MusicList {
  /** Tracks to play (shuffled) while no song is on stage. */
  idle: string[];
  /** The cheering sound played once with the score, if one is present. */
  cheer: string | null;
}

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".ogg", ".oga", ".wav", ".flac"]);

export function defaultMusicDir(): string {
  return process.env.MUSIC_DIR ?? "/music";
}

/** The cheer is any file whose base name starts with "cheer". */
export function isCheerFile(name: string): boolean {
  return /^cheer/i.test(name);
}

// Extension of a POSIX-style file name, lowercased. A leading dot is the file
// name (dotfile), not an extension — mirrors path.extname without pulling
// node:path into any client bundle.
function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

// List the playable audio in dir. A missing, unreadable or empty directory — the
// volume may simply not be mounted — yields an empty listing and never throws.
export async function listMusic(dir: string): Promise<MusicList> {
  let entries: Awaited<ReturnType<typeof readEntries>>;
  try {
    entries = await readEntries(dir);
  } catch {
    return { idle: [], cheer: null };
  }
  const idle: string[] = [];
  let cheer: string | null = null;
  for (const entry of entries) {
    // Skip dotfiles (editor/temp artifacts) and anything that is not audio.
    if (!entry.isFile() || entry.name.startsWith(".") || !AUDIO_EXT.has(extOf(entry.name))) continue;
    if (isCheerFile(entry.name)) {
      // First cheer wins (alphabetical, so the choice is stable).
      if (cheer === null || entry.name < cheer) cheer = entry.name;
    } else {
      idle.push(entry.name);
    }
  }
  idle.sort();
  return { idle, cheer };
}

async function readEntries(dir: string) {
  // Server-only (route handler); the lazy, ignored import keeps bundlers from
  // resolving this builtin in client chunks.
  const fs = await import(/* turbopackIgnore: true */ "node:fs/promises");
  return fs.readdir(dir, { withFileTypes: true });
}

/** MIME type for serving one audio file. */
export function musicContentType(fileName: string): string {
  switch (extOf(fileName)) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".aac":
      return "audio/mp4";
    case ".ogg":
    case ".oga":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}
