// src/lib/remoteCommands.ts
// Command vocabulary shared by the controller/TV POST endpoint and the pure
// state transition function. Kept framework-free so it can be unit-tested in
// plain node (see tests/remoteCommands.test.ts). `now` is injected so the
// server-authoritative countdown deadline is deterministic in tests.
import type { RemoteState } from "@/lib/remoteStore";

export type RemoteCommand =
  | { kind: "enqueue"; songId: string; singer?: string }
  | { kind: "dequeue"; index: number }
  | { kind: "reorder"; from: number; to: number }
  | { kind: "play"; songId?: string; singer?: string; countdownSec?: number }
  | { kind: "next"; countdownSec?: number }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "restart" }
  | { kind: "seek"; sec: number }
  | { kind: "setVolume"; volume: number }
  | { kind: "setLyricOffset"; offsetSec: number }
  | { kind: "setSinger"; singer: string }
  | { kind: "clearQueue" }
  | { kind: "beginPlayback" }
  | { kind: "progress"; positionSec: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function idle(state: RemoteState): RemoteState {
  return {
    ...state,
    currentId: null,
    currentSinger: "",
    phase: "idle",
    isPlaying: false,
    positionSec: 0,
    countdownEndsAt: null,
  };
}

export function applyCommand(
  state: RemoteState,
  cmd: RemoteCommand,
  now: number = Date.now(),
): RemoteState {
  switch (cmd.kind) {
    case "enqueue": {
      // Duplicate songs are rejected; the controller surfaces "already in queue".
      if (state.queue.some((e) => e.songId === cmd.songId)) return state;
      return { ...state, queue: [...state.queue, { songId: cmd.songId, singer: cmd.singer ?? "" }] };
    }
    case "dequeue": {
      if (cmd.index < 0 || cmd.index >= state.queue.length) return state;
      return { ...state, queue: state.queue.filter((_, i) => i !== cmd.index) };
    }
    case "reorder": {
      const { from, to } = cmd;
      if (from < 0 || from >= state.queue.length || to < 0 || to >= state.queue.length || from === to) {
        return state;
      }
      const queue = [...state.queue];
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);
      return { ...state, queue };
    }
    case "play": {
      // Play a specific song (pulled from the queue when present) or the queue
      // head. An optional countdown puts the room in the "starting in N" phase.
      const idx = cmd.songId ? state.queue.findIndex((e) => e.songId === cmd.songId) : 0;
      const entry = idx >= 0 ? state.queue[idx] : undefined;
      const songId = cmd.songId ?? entry?.songId ?? null;
      if (!songId) return state;
      const singer = cmd.singer ?? entry?.singer ?? state.currentSinger;
      const queue = idx >= 0 ? state.queue.filter((_, i) => i !== idx) : state.queue;
      const sec = cmd.countdownSec ?? 0;
      return {
        ...state,
        queue,
        currentId: songId,
        currentSinger: singer,
        phase: sec > 0 ? "countdown" : "playing",
        isPlaying: sec <= 0,
        positionSec: 0,
        countdownEndsAt: sec > 0 ? now + sec * 1000 : null,
      };
    }
    case "next": {
      const [entry, ...rest] = state.queue;
      if (!entry) return idle(state);
      const sec = cmd.countdownSec ?? 0;
      return {
        ...state,
        queue: rest,
        currentId: entry.songId,
        currentSinger: entry.singer,
        phase: sec > 0 ? "countdown" : "playing",
        isPlaying: sec <= 0,
        positionSec: 0,
        countdownEndsAt: sec > 0 ? now + sec * 1000 : null,
      };
    }
    case "pause":
      return { ...state, isPlaying: false };
    case "resume":
      if (!state.currentId) return state;
      return { ...state, isPlaying: true, phase: "playing", countdownEndsAt: null };
    case "stop":
      return idle(state);
    case "restart":
      if (!state.currentId) return state;
      return {
        ...state,
        positionSec: 0,
        seekNonce: state.seekNonce + 1,
        isPlaying: true,
        phase: "playing",
        countdownEndsAt: null,
      };
    case "seek":
      return { ...state, positionSec: Math.max(0, cmd.sec), seekNonce: state.seekNonce + 1 };
    case "setVolume":
      return { ...state, volume: clamp01(cmd.volume) };
    case "setLyricOffset":
      return { ...state, lyricOffsetSec: cmd.offsetSec };
    case "setSinger":
      return { ...state, currentSinger: cmd.singer };
    case "clearQueue":
      return { ...state, queue: [] };
    case "beginPlayback":
      if (!state.currentId) return state;
      return { ...state, phase: "playing", isPlaying: true, positionSec: 0, countdownEndsAt: null };
    case "progress":
      // The TV reports its position; ignore stale reports while paused.
      if (!state.isPlaying) return state;
      return { ...state, positionSec: Math.max(0, cmd.positionSec) };
  }
}
