// src/lib/media.ts
// Background media on the /media volume: the listing of slideshow images
// and BGV videos, the MIME mapping for serving them, and the pure
// slideshow stepping rule. BackgroundMedia (client) imports the pure
// parts, so this module must not statically reference node builtins —
// listMedia loads the fs module lazily, and the import is flagged
// turbopackIgnore so the client bundle never resolves it.

export interface MediaList {
  images: string[];
  videos: string[];
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".webm"]);

export function defaultMediaDir(): string {
  return process.env.MEDIA_DIR ?? "/media";
}

// Extension of a POSIX-style file name, lowercased. A leading dot is the
// file name (dotfile), not an extension — mirrors path.extname without
// pulling node:path into the (shared) client bundle.
function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

// List the supported media file names in dir (flat, sorted). A missing,
// unreadable, or empty directory — the volume may simply not be mounted —
// yields { images: [], videos: [] } and never throws.
export async function listMedia(dir: string): Promise<MediaList> {
  let entries: Awaited<ReturnType<typeof readEntries>>;
  try {
    entries = await readEntries(dir);
  } catch {
    return { images: [], videos: [] };
  }
  const images: string[] = [];
  const videos: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extOf(entry.name);
    if (IMAGE_EXT.has(ext)) images.push(entry.name);
    else if (VIDEO_EXT.has(ext)) videos.push(entry.name);
  }
  images.sort();
  videos.sort();
  return { images, videos };
}

async function readEntries(dir: string) {
  // Server-only (route handler); the lazy, ignored import keeps bundlers
  // from trying to resolve this builtin in client chunks.
  const fs = await import(/* turbopackIgnore: true */ "node:fs/promises");
  return fs.readdir(dir, { withFileTypes: true });
}

// MIME type for serving one media file; anything unexpected still gets a
// generic binary type so the browser shows a download instead of text.
export function mediaContentType(fileName: string): string {
  switch (extOf(fileName)) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

// Slideshow step: the number of whole elapsed intervals decides how far
// to advance, and the result wraps around. With no items (or a
// nonpositive interval) the current index is kept, so the slideshow
// never advances out of range.
export function pickNextIndex(
  current: number,
  length: number,
  elapsedMs: number,
  intervalMs: number,
): number {
  if (length <= 0 || intervalMs <= 0) return current;
  const steps = Math.max(0, Math.floor(elapsedMs / intervalMs));
  return (current + steps) % length;
}
