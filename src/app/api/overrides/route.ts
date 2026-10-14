// src/app/api/overrides/route.ts
// Manual song-metadata overrides (host/admin).
//   GET                -> the override map { [songId]: { title?, artist?, number? } }
//   PUT  {id, title?, artist?, number?} -> merge and persist an override
//   DELETE ?id=<songId> -> remove an override (fall back to parsed metadata)
import { connection, NextResponse } from "next/server";
import {
  clearOverride,
  loadOverrides,
  setOverride,
  type SongOverride,
} from "@/lib/overrides";

function parsePatch(value: unknown): { id: string; patch: SongOverride } | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.id !== "string" || body.id.length === 0) return null;
  const patch: SongOverride = {};
  for (const key of ["title", "artist", "number"] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== "string") return null;
    patch[key] = v;
  }
  return { id: body.id, patch };
}

export async function GET() {
  await connection();
  return NextResponse.json(await loadOverrides());
}

export async function PUT(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parsePatch(body);
  if (!parsed) return NextResponse.json({ error: "Invalid override" }, { status: 400 });
  return NextResponse.json(await setOverride(parsed.id, parsed.patch));
}

export async function DELETE(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  return NextResponse.json(await clearOverride(id));
}
