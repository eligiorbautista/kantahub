// src/app/api/songs/route.ts
// Song library endpoint.
//   (no params)                     -> the full SongMeta[] (back-compat)
//   ?ids=a,b,c                      -> only the songs with those ids (queue resolve)
//   ?q=&limit=&offset=              -> { total, items } for fast, paged search
import { connection, NextResponse } from "next/server";
import { getSongsIndex, defaultSongsDir } from "@/lib/songIndex";
import { filterSongs } from "@/lib/search";
import { applyOverrides, loadOverrides } from "@/lib/overrides";

export async function GET(request: Request) {
  // The songs dir is a volume mounted at runtime: the response depends on
  // the host filesystem, not on anything knowable at build time (same
  // reasoning as /api/soundfont).
  await connection();
  const songs = applyOverrides(await getSongsIndex(defaultSongsDir()), await loadOverrides());
  const url = new URL(request.url);

  const idsParam = url.searchParams.get("ids");
  if (idsParam !== null) {
    const wanted = new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean));
    return NextResponse.json(songs.filter((s) => wanted.has(s.id)));
  }

  const numberParam = url.searchParams.get("number");
  if (numberParam !== null) {
    const n = numberParam.trim();
    if (!n) return NextResponse.json([]);
    const stripped = n.replace(/^0+/, "");
    return NextResponse.json(
      songs.filter((s) => s.number !== undefined && (s.number === n || s.number.replace(/^0+/, "") === stripped)),
    );
  }

  const q = url.searchParams.get("q");
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  if (q !== null || limitParam !== null || offsetParam !== null) {
    const filtered = filterSongs(songs, q ?? "");
    const offset = Math.max(0, Number(offsetParam ?? 0) || 0);
    const limit = limitParam !== null ? Math.max(0, Number(limitParam) || 0) : filtered.length;
    return NextResponse.json({ total: filtered.length, items: filtered.slice(offset, offset + limit) });
  }

  return NextResponse.json(songs);
}
