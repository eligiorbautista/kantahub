// src/app/api/songs/[id]/file/route.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { connection, NextResponse } from "next/server";
import { getSongsIndex, defaultSongsDir } from "@/lib/songIndex";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Runtime filesystem lookup: keep dynamic under Cache Components.
  await connection();
  const { id } = await params;
  const songsDir = defaultSongsDir();
  const song = (await getSongsIndex(songsDir)).find((s) => s.id === id);
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }
  const buf = await fs.readFile(path.join(songsDir, song.fileName));
  return new NextResponse(new Uint8Array(buf), {
    // Song bytes must never be served stale from a cache: files can be replaced
    // in place (same path, new audio) and the player must always get the real
    // bytes for the id it asked for.
    headers: { "Content-Type": "audio/midi", "Cache-Control": "private, no-store" },
  });
}
