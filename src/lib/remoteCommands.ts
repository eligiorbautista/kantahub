// src/lib/remoteCommands.ts
// Command vocabulary shared by the phone remote POST endpoint and the pure
// state transition function. Kept framework-free so it can be unit-tested in
// plain node (see tests/remoteCommands.test.ts).
import type { RemoteState } from "@/lib/remoteStore";

export type RemoteCommand =
  | { kind: "enqueue"; songId: string }
  | { kind: "dequeue"; songId: string }
  | { kind: "play"; songId: string }
  | { kind: "pause" }
  | { kind: "next" };

export function applyCommand(state: RemoteState, cmd: RemoteCommand): RemoteState {
  switch (cmd.kind) {
    case "enqueue":
      if (state.queue.includes(cmd.songId)) {
        return state;
      }
      return { ...state, queue: [...state.queue, cmd.songId] };
    case "dequeue":
      return { ...state, queue: state.queue.filter((id) => id !== cmd.songId) };
    case "play":
      return {
        ...state,
        currentId: cmd.songId,
        isPlaying: true,
        positionSec: 0,
        queue: state.queue.filter((id) => id !== cmd.songId),
      };
    case "pause":
      return { ...state, isPlaying: false };
    case "next": {
      const [nextId, ...rest] = state.queue;
      return {
        ...state,
        currentId: nextId ?? null,
        isPlaying: nextId !== undefined ? state.isPlaying : false,
        positionSec: 0,
        queue: rest,
      };
    }
  }
}
