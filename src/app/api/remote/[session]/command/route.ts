// src/app/api/remote/[session]/command/route.ts
// Controller/TV command endpoint: parses a JSON RemoteCommand, applies it to
// the in-memory room store, and returns the new state. The room id is the URL
// segment (the TV display and every controller share one room).
import { connection, NextResponse } from "next/server";
import { applyCommand, type RemoteCommand } from "@/lib/remoteCommands";
import { getSession, updateSession } from "@/lib/remoteStore";

const KINDS = new Set<RemoteCommand["kind"]>([
  "enqueue",
  "dequeue",
  "reorder",
  "play",
  "next",
  "pause",
  "resume",
  "stop",
  "restart",
  "seek",
  "setVolume",
  "setLyricOffset",
  "setSinger",
  "clearQueue",
  "beginPlayback",
  "beginScore",
  "progress",
]);

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isRemoteCommand(value: unknown): value is RemoteCommand {
  if (typeof value !== "object" || value === null) return false;
  const cmd = value as Record<string, unknown>;
  if (!isStr(cmd.kind) || !KINDS.has(cmd.kind as RemoteCommand["kind"])) return false;
  switch (cmd.kind) {
    case "enqueue":
      return isStr(cmd.songId) && cmd.songId.length > 0 && (cmd.singer === undefined || isStr(cmd.singer));
    case "dequeue":
      return isNum(cmd.index);
    case "reorder":
      return isNum(cmd.from) && isNum(cmd.to);
    case "play":
      return (
        (cmd.songId === undefined || isStr(cmd.songId)) &&
        (cmd.singer === undefined || isStr(cmd.singer)) &&
        (cmd.countdownSec === undefined || isNum(cmd.countdownSec))
      );
    case "next":
      return cmd.countdownSec === undefined || isNum(cmd.countdownSec);
    case "seek":
      return isNum(cmd.sec);
    case "setVolume":
      return isNum(cmd.volume);
    case "setLyricOffset":
      return isNum(cmd.offsetSec);
    case "setSinger":
      return isStr(cmd.singer);
    case "beginScore":
      return isNum(cmd.seconds);
    case "progress":
      return isNum(cmd.positionSec);
    default:
      return true;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string }> },
) {
  // Room state lives in the runtime in-memory store: keep dynamic under
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
  if (body.kind === "setLyricOffset") {
    // Persist the tuned value so it survives a container restart.
    const { saveSettings } = await import("@/lib/settings");
    void saveSettings({ lyricOffsetSec: next.lyricOffsetSec });
  }
  return NextResponse.json(updateSession(session, next));
}
