// src/app/api/songs/route.ts
import { connection, NextResponse } from "next/server";
import { getSongsIndex, defaultSongsDir } from "@/lib/songIndex";

export async function GET() {
  // The songs dir is a volume mounted at runtime: the response depends on
  // the host filesystem, not on anything knowable at build time (same
  // reasoning as /api/soundfont).
  await connection();
  return NextResponse.json(await getSongsIndex(defaultSongsDir()));
}
