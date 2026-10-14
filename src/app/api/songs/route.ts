// src/app/api/songs/route.ts
import { NextResponse } from "next/server";
import { listSongs } from "@/lib/scanner";

export async function GET() {
  return NextResponse.json(await listSongs(process.env.SONGS_DIR ?? "/songs"));
}
