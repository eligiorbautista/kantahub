// src/app/api/songs/[id]/audio/route.ts
// Rendered audio for one song (see src/lib/renderAudio.ts).
//
// The TV plays this through a plain <audio> element, which works on ANY origin —
// including the plain http:// address a Smart TV browser is limited to, where
// the in-browser Web Audio synth is unavailable. Served with HTTP Range support
// so playback can start and seek before the whole file has arrived.
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { connection, NextResponse } from "next/server";
import { parseRange } from "@/lib/httpRange";
import { renderSongAudio } from "@/lib/renderAudio";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Rendering depends on the mounted volumes and writes to the index volume.
  await connection();
  const { id } = await params;

  const file = await renderSongAudio(id);
  if (!file) {
    return NextResponse.json({ error: "Audio not available for this song" }, { status: 404 });
  }

  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return NextResponse.json({ error: "Audio not available for this song" }, { status: 404 });
  }

  const headers = {
    "Content-Type": "audio/wav",
    // Rendered files are immutable for a given id (the cache key includes the
    // soundfont), but keep them revalidatable so a replaced soundfont is picked
    // up rather than served from a stale cache for an hour.
    "Cache-Control": "public, no-cache",
    "Accept-Ranges": "bytes",
  };

  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    const stream = Readable.toWeb(createReadStream(file, { start: range.start, end: range.end }));
    return new Response(stream as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(file));
  return new Response(stream as ReadableStream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
