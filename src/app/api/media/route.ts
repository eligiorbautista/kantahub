// src/app/api/media/route.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { connection, NextResponse } from "next/server";
import { defaultMediaDir, listMedia, mediaContentType } from "@/lib/media";

// GET /api/media           → the volume's listing { images, videos }
// GET /api/media?file=name → that media file's bytes
//
// /media is a volume mounted at runtime: the response depends on the
// host filesystem, not on anything knowable at build time, so both
// shapes are answered from the live filesystem (same reasoning as
// /api/songs and /api/soundfont).
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
  const buf = await fs.readFile(path.join(mediaDir, fileName));
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": mediaContentType(fileName) },
  });
}
