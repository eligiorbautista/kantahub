// src/app/api/soundfont/route.ts
import { promises as fs } from "node:fs";
import { connection, NextResponse } from "next/server";
import { findSoundfont } from "@/lib/soundfont";

export async function GET() {
  // /sound is a volume mounted at runtime: the response depends on the
  // host filesystem, not on anything knowable at build time. Deferring
  // to request time prevents the build-time prerender (which has no
  // /sound) from baking the 404 into a static response.
  await connection();
  const soundDir = process.env.SOUND_DIR ?? "/sound";
  const font = findSoundfont(soundDir);
  if (!font) {
    return NextResponse.json({ error: "No soundfont found in /sound" }, { status: 404 });
  }
  const buf = await fs.readFile(font);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "audio/x-soundfont" },
  });
}
