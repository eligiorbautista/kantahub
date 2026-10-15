// src/app/api/music/route.ts
// The optional `music/` volume.
//   GET /api/music           -> { idle: string[], cheer: string | null }
//   GET /api/music?file=name -> that file's bytes (Range supported)
//
// Read live from the mounted folder, so a dropped-in MP3 is picked up on the
// next request. Range support lets the browser seek and start before the whole
// track has arrived.
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { connection, NextResponse } from "next/server";
import { parseRange } from "@/lib/httpRange";
import { defaultMusicDir, listMusic, musicContentType } from "@/lib/music";

export async function GET(request: Request) {
  await connection();
  const dir = defaultMusicDir();
  const fileName = new URL(request.url).searchParams.get("file");
  if (!fileName) {
    return NextResponse.json(await listMusic(dir));
  }

  // Only serve names that came from the listing itself, so a crafted ?file= can
  // never traverse outside the volume.
  const list = await listMusic(dir);
  if (!list.idle.includes(fileName) && list.cheer !== fileName) {
    return NextResponse.json({ error: "Music file not found" }, { status: 404 });
  }

  const filePath = path.join(dir, fileName);
  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Music file not found" }, { status: 404 });
  }

  const headers = {
    "Content-Type": musicContentType(fileName),
    // Revalidate rather than cache hard: the host may replace a track in place.
    "Cache-Control": "public, no-cache",
    "Accept-Ranges": "bytes",
  };

  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    const stream = Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end }));
    return new Response(stream as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath));
  return new Response(stream as ReadableStream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
