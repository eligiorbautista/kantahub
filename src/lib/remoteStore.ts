// src/lib/remoteStore.ts
// In-memory room state store shared by the TV display (/tv) and the controller
// (/ and /remote). A "room" holds the live karaoke state: the queue (with a
// singer per entry), the song on stage, the server-authoritative countdown,
// the reported playback position, and host-adjustable settings. Every update
// notifies subscribers, which is what the SSE endpoint streams out.

export interface QueueEntry {
  songId: string;
  /** Name of the person who will sing this song (may be empty). */
  singer: string;
}

export type RoomPhase = "idle" | "countdown" | "playing" | "score";

export interface ScoreResult {
  value: number;
  reaction: string;
}

export interface RemoteState {
  session: string;
  queue: QueueEntry[];
  /** Song currently on stage (countdown, playing, or being scored). */
  currentId: string | null;
  /** Singer of the song on stage. */
  currentSinger: string;
  phase: RoomPhase;
  isPlaying: boolean;
  /** Last reported playback position in seconds. */
  positionSec: number;
  /**
   * Bumped on every explicit seek/restart. The TV display watches this (not
   * positionSec) so its own progress reports never trigger a seek back into
   * the audio engine.
   */
  seekNonce: number;
  /**
   * Server-authoritative deadline of the "starting in 5…" countdown, as epoch
   * milliseconds. Every client computes the remaining seconds from this plus
   * its own clock drift, so all devices show the same countdown.
   */
  countdownEndsAt: number | null;
  /**
   * Post-song celebration: the cosmetic score and the epoch-ms deadline before
   * the next song may start. Set while phase === "score".
   */
  score: ScoreResult | null;
  scoreEndsAt: number | null;
  /** Server clock when this snapshot was produced (epoch ms), for clock sync. */
  serverNow: number;
  /** Host lyrics timing nudge in seconds (positive delays the highlight). */
  lyricOffsetSec: number;
  /**
   * Bumped by the "refresh all" control: every connected client clears its
   * caches and reloads when this changes, so a stale page can be reset from the
   * phone without touching each device.
   */
  reloadNonce: number;
  /** Playback volume 0..1. */
  volume: number;
}

export type RemoteStatePatch = Partial<Omit<RemoteState, "session">>;
export type RemoteSubscriber = (state: RemoteState) => void;

const sessions = new Map<string, RemoteState>();
const subscribers = new Map<string, Set<RemoteSubscriber>>();

// Default lyric-sync offset for new rooms, seeded from persisted host settings
// at server start (see instrumentation.ts). Kept as a plain module value so this
// module stays free of node-only imports (client code imports its types).
let defaultLyricOffsetSec = 0;

export function setDefaultLyricOffsetSec(v: number): void {
  defaultLyricOffsetSec = Math.max(-5, Math.min(5, v));
}

function createEmptyState(session: string): RemoteState {
  return {
    session,
    queue: [],
    currentId: null,
    currentSinger: "",
    phase: "idle",
    isPlaying: false,
    positionSec: 0,
    seekNonce: 0,
    countdownEndsAt: null,
    score: null,
    scoreEndsAt: null,
    serverNow: Date.now(),
    lyricOffsetSec: defaultLyricOffsetSec,
    volume: 0.8,
    reloadNonce: 0,
  };
}

export function getSession(id: string): RemoteState {
  let state = sessions.get(id);
  if (!state) {
    state = createEmptyState(id);
    sessions.set(id, state);
  }
  return state;
}

export function updateSession(id: string, patch: RemoteStatePatch): RemoteState {
  const state = { ...getSession(id), ...patch, session: id, serverNow: Date.now() };
  sessions.set(id, state);
  const subs = subscribers.get(id);
  if (subs) {
    for (const cb of subs) {
      cb(state);
    }
  }
  return state;
}

export function subscribe(id: string, cb: RemoteSubscriber): () => void {
  let subs = subscribers.get(id);
  if (!subs) {
    subs = new Set();
    subscribers.set(id, subs);
  }
  subs.add(cb);
  return () => {
    subs!.delete(cb);
    if (subs!.size === 0) {
      subscribers.delete(id);
    }
  };
}

/** Test-only: drop all in-memory rooms. */
export function resetSessions(): void {
  sessions.clear();
  subscribers.clear();
}
