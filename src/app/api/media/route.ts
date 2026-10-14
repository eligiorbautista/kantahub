// src/app/api/media/route.ts
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { connection, NextResponse } from "next/server";
import { defaultMediaDir, listMedia, mediaContentType } from "@/lib/media";

// GET /api/media           → the volume's listing { images, videos }
// GET /api/media?file=name → that media file's bytes
//
// /media is a volume mounted at runtime: the response depends on the
// host filesystem, not on anything knowable at build time, so both
// shapes are answered from the live filesystem (same reasoning as
// /api/songs and /api/soundfont).
//
// Media files are served as a stream with HTTP Range support. Background
// videos can be hundreds of MB; without Range the browser cannot seek and the
// whole file has to be buffered, so we answer 206 partial content when asked
// (and advertise Accept-Ranges on the full response).
export async function GET(request: Request) {
  await connection();
  const mediaDir = defaultMediaDir();
  const media = await listMedia(mediaDir);
  const fileName = new URL(request.url).searchParams.get("file");
  if (!fileName) {
    return NextResponse.json(media);
  }
  // Only serve names that came from the directory listing itself, so a
  // crafted ?file= can never traverse outside the volume; everything
  // else is a plain 404 (a missing volume simply lists empty).
  if (!media.images.includes(fileName) && !media.videos.includes(fileName)) {
    return NextResponse.json({ error: "Media file not found" }, { status: 404 });
  }

  const filePath = path.join(mediaDir, fileName);
  const contentType = mediaContentType(fileName);
  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Media file not found" }, { status: 404 });
  }

  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  if (range) {
    const stream = Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end }));
    return new Response(stream as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath));
  return new Response(stream as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// Browsers probe media with HEAD before/while loading; answer it with the same
// headers and no body so the video element can plan its ranges.
export async function HEAD(request: Request) {
  await connection();
  const mediaDir = defaultMediaDir();
  const media = await listMedia(mediaDir);
  const fileName = new URL(request.url).searchParams.get("file");
  if (!fileName || (!media.images.includes(fileName) && !media.videos.includes(fileName))) {
    return new Response(null, { status: 404 });
  }
  try {
    const size = (await fs.stat(path.join(mediaDir, fileName))).size;
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": mediaContentType(fileName),
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

interface ByteRange {
  start: number;
  end: number;
}

/** Parse a single "bytes=start-end" Range header. Returns null when absent or
 *  not a byte range (serve the whole file) and "invalid" for an unsatisfiable
 *  range (416). */
function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
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
