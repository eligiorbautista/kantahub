// src/lib/httpRange.ts
// Shared HTTP Range parsing for file responses (background media, rendered
// audio). Kept in one place so every streaming route answers 206/416 the same
// way and a partially downloaded file can always resume.

export interface ByteRange {
  start: number;
  end: number;
}

/** Parse a single "bytes=start-end" Range header. Returns null when absent or
 *  not a byte range (serve the whole file) and "invalid" for an unsatisfiable
 *  range (416). */
export function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return "invalid";

  let start: number;
  let end: number;
  if (startStr === "") {
    // Suffix range: the last N bytes.
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === "" ? size - 1 : Number(endStr);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}
