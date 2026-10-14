// src/lib/remoteStore.ts
// In-memory per-session state store for the web-based phone remote.
// Each session id (from the QR code URL) holds the shared playback state a
// phone can read/patch, plus a set of subscribers notified on every update.

export interface RemoteState {
  session: string;
  queue: string[];
  currentId: string | null;
  isPlaying: boolean;
  positionSec: number;
}

export type RemoteStatePatch = Partial<Omit<RemoteState, "session">>;
export type RemoteSubscriber = (state: RemoteState) => void;

const sessions = new Map<string, RemoteState>();
const subscribers = new Map<string, Set<RemoteSubscriber>>();

function createEmptyState(session: string): RemoteState {
  return {
    session,
    queue: [],
    currentId: null,
    isPlaying: false,
    positionSec: 0,
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
  const state = { ...getSession(id), ...patch, session: id };
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
