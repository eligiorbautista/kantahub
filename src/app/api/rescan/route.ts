// src/app/api/rescan/route.ts
// Library rescan/migration endpoint (host/admin).
//   POST -> start a background re-parse of the whole library (no-op if running)
//   GET  -> the current rescan status + a preview of changed titles/artists
import { connection, NextResponse } from "next/server";
import { getRescanStatus, startRescan } from "@/lib/rescan";

export async function GET() {
  await connection();
  return NextResponse.json(getRescanStatus());
}

export async function POST() {
  await connection();
  return NextResponse.json(startRescan());
}
