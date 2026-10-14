// src/app/api/playlists/route.ts
// M3U playlist import endpoint.
//
// POST accepts a raw M3U body, resolves the referenced names to known song
// ids via the cached library index, and returns them as { songIds }. Query
// params (all optional, all documented):
//   ?session=<id>  also enqueue the resolved songs, in order, into that
//                  remote session's queue (same store as
//                  /api/remote/[session]/command) and return the resulting
//                  { state } alongside the ids.
//   ?name=<name>   also register the import in the in-memory playlist
//                  registry that GET lists (replacing an earlier import
//                  of the same name).
//
// GET lists registered playlists as [{ name, songIds }, ...]. The registry
// lives in server memory (like the remote session store): it survives
// across requests but not restarts, and nothing is persisted to disk.
import { connection, NextResponse } from "next/server";
import { parseM3U, resolveM3U } from "@/lib/m3u";
import { applyCommand } from "@/lib/remoteCommands";
import { getSession, updateSession } from "@/lib/remoteStore";
import { defaultSongsDir, getSongsIndex } from "@/lib/songIndex";

interface Playlist {
  name: string;
  songIds: string[];
}

const knownPlaylists = new Map<string, Playlist>();

export async function GET() {
  // The playlist registry and the songs dir are runtime data (the songs
  // dir is a mounted volume), not anything knowable at build time.
  await connection();
  return NextResponse.json([...knownPlaylists.values()]);
}

export async function POST(request: Request) {
  // Same reasoning as GET: the answer depends on the runtime library and
  // in-memory state.
  await connection();

  const names = parseM3U(await request.text());
  if (names.length === 0) {
    return NextResponse.json({ error: "No playlist entries in body" }, { status: 400 });
  }

  const songIds = resolveM3U(names, await getSongsIndex(defaultSongsDir()));

  const params = new URL(request.url).searchParams;

  const name = params.get("name")?.trim();
  if (name) {
    knownPlaylists.set(name, { name, songIds: [...songIds] });
  }

  const session = params.get("session");
  let state = null;
  if (session) {
    let next = getSession(session);
    for (const songId of songIds) {
      next = applyCommand(next, { kind: "enqueue", songId });
    }
    state = updateSession(session, next);
  }

  return NextResponse.json({ songIds, state });
}
