// src/app/api/songs/[id]/file/route.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { listSongs } from "@/lib/scanner";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const songsDir = process.env.SONGS_DIR ?? "/songs";
  const song = (await listSongs(songsDir)).find((s) => s.id === id);
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }
  const buf = await fs.readFile(path.join(songsDir, song.fileName));
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "audio/midi" },
  });
}
