"use client";

// src/lib/useRoom.ts
// Client hook that binds a component to a room: subscribes to the SSE state
// stream and exposes a `send` that posts commands. Also tracks the clock offset
// between this device and the server so the server-authoritative countdown can
// be rendered identically everywhere.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RemoteCommand } from "@/lib/remoteCommands";
import type { RemoteState } from "@/lib/remoteStore";

export interface RoomHandle {
  state: RemoteState | null;
  /** serverNow - localNow, in ms, from the latest snapshot. */
  clockOffset: number;
  connected: boolean;
  /** Local clock adjusted to the server's clock. */
  now(): number;
  send(cmd: RemoteCommand): Promise<RemoteState | null>;
}

export function useRoom(roomId: string): RoomHandle {
  const [state, setState] = useState<RemoteState | null>(null);
  const [connected, setConnected] = useState(false);
  const offsetRef = useRef(0);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    const es = new EventSource(`/api/remote/${encodeURIComponent(roomId)}/events`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    const onMessage = (ev: MessageEvent) => {
      try {
        const s = JSON.parse(ev.data as string) as RemoteState;
        const off = s.serverNow - Date.now();
        offsetRef.current = off;
        setClockOffset(off);
        setState(s);
      } catch (err) {
        console.error("bad room state payload:", err);
      }
    };
    es.addEventListener("message", onMessage);
    return () => es.close();
  }, [roomId]);

  const send = useCallback(
    async (cmd: RemoteCommand): Promise<RemoteState | null> => {
      try {
        const res = await fetch(`/api/remote/${encodeURIComponent(roomId)}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cmd),
        });
        if (!res.ok) return null;
        return (await res.json()) as RemoteState;
      } catch (err) {
        console.error("room command failed:", err);
        return null;
      }
    },
    [roomId],
  );

  const now = useCallback(() => Date.now() + offsetRef.current, []);

  return { state, clockOffset, connected, now, send };
}
