// src/app/api/remote/[session]/events/route.ts
// Server-Sent Events stream for the phone remote: emits the session state on
// connect and on every store update, plus a heartbeat comment to keep the
// connection alive through proxies. Cleans up on client abort.
import { connection } from "next/server";
import { getSession, subscribe, type RemoteState } from "@/lib/remoteStore";

const HEARTBEAT_MS = 15_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ session: string }> },
) {
  // Session state lives in the runtime in-memory store: keep dynamic under
  // Cache Components (same reasoning as /api/songs).
  await connection();
  const { session } = await params;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    unsubscribe?.();
    if (heartbeat !== undefined) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const push = (chunk: string) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          cleanup();
        }
      };
      const sendState = (state: RemoteState) => {
        push(`data: ${JSON.stringify(state)}\n\n`);
      };

      sendState(getSession(session));
      unsubscribe = subscribe(session, sendState);
      heartbeat = setInterval(() => {
        push(`: heartbeat\n\n`);
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // Stream already closed.
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
