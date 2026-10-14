// src/app/api/remote/[session]/command/route.ts
// Phone remote command endpoint: parses a JSON RemoteCommand, applies it to
// the in-memory session store, and returns the new state.
import { connection, NextResponse } from "next/server";
import { applyCommand, type RemoteCommand } from "@/lib/remoteCommands";
import { getSession, updateSession } from "@/lib/remoteStore";

const KINDS = new Set(["enqueue", "dequeue", "play", "pause", "next"]);

function isRemoteCommand(value: unknown): value is RemoteCommand {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const cmd = value as { kind?: unknown; songId?: unknown };
  if (typeof cmd.kind !== "string" || !KINDS.has(cmd.kind)) {
    return false;
  }
  if (cmd.kind === "enqueue" || cmd.kind === "dequeue" || cmd.kind === "play") {
    return typeof cmd.songId === "string" && cmd.songId.length > 0;
  }
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string }> },
) {
  // Session state lives in the runtime in-memory store: keep dynamic under
  // Cache Components.
  await connection();
  const { session } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRemoteCommand(body)) {
    return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  }

  const next = applyCommand(getSession(session), body);
  return NextResponse.json(updateSession(session, next));
}
