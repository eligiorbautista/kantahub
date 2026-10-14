// src/lib/persistence.ts
// Local favorites and recently-played history for the TV shell. Both lists
// are plain song-id arrays stored as JSON under kantahub.* keys. The storage
// is always injected as the first argument so tests (and any future SSR use)
// can pass a Map-backed stub instead of window.localStorage.

// The subset of localStorage these helpers use. Structural on purpose: the
// DOM Storage type demands removeItem/clear/key, which test stubs don't have.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const FAVORITES_KEY = "kantahub.favorites";
export const RECENT_KEY = "kantahub.recent";

// One shared inert store for every non-browser call, so successive calls
// against the default see each other's writes.
const fallbackStorage: StorageLike = (() => {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => void mem.set(key, value),
  };
})();

// The browser default for UI code: window.localStorage when available, an
// inert memory store otherwise so callers never throw on the server or in
// privacy modes that block storage.
export function defaultStorage(): StorageLike {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Storage access can throw (sandboxed/private modes); fall through.
  }
  return fallbackStorage;
}

// Parse a stored id list. Missing, corrupt, or non-array payloads all read as
// [] so one bad value can never break the screen.
function readIdList(storage: StorageLike, key: string): string[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

// Stored lists are always the full current state, so writes and reads stay
// symmetric.
function writeIdList(storage: StorageLike, key: string, ids: string[]): void {
  storage.setItem(key, JSON.stringify(ids));
}

export function loadFavorites(storage: StorageLike): string[] {
  return readIdList(storage, FAVORITES_KEY);
}

export function loadRecent(storage: StorageLike): string[] {
  return readIdList(storage, RECENT_KEY);
}

// Add the song to favorites, or remove it if it is already there. Returns
// the resulting list in insertion order.
export function toggleFavorite(storage: StorageLike, songId: string): string[] {
  const ids = loadFavorites(storage);
  const next = ids.includes(songId) ? ids.filter((id) => id !== songId) : [...ids, songId];
  writeIdList(storage, FAVORITES_KEY, next);
  emitChange();
  return next;
}

// Record a play: newest-first, deduped — replaying a song moves it to the
// front instead of adding it twice. Returns the resulting list.
export function pushRecent(storage: StorageLike, songId: string): string[] {
  const next = [songId, ...loadRecent(storage).filter((id) => id !== songId)];
  writeIdList(storage, RECENT_KEY, next);
  emitChange();
  return next;
}

// ---- React external-store binding --------------------------------------
// useSyncExternalStore is the sanctioned way to read localStorage client
// side (a mount-time read would either break hydration rules or trip
// lint against synchronous setState-in-effect). These four exports keep
// persistence.ts free of React imports; the TV shell wires them up.

const EMPTY_IDS: string[] = [];

const listeners = new Set<() => void>();

export function subscribeSongLists(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChange(): void {
  for (const listener of listeners) listener();
}

type IdListSnapshot = { raw: string | null; ids: string[] };

// Snapshots must keep a stable identity between renders, so each list is
// cached against its raw JSON and only re-parsed when that changes.
let favoritesSnapshot: IdListSnapshot = { raw: null, ids: EMPTY_IDS };
let recentSnapshot: IdListSnapshot = { raw: null, ids: EMPTY_IDS };

function snapshotFor(key: string, cache: IdListSnapshot): IdListSnapshot {
  const raw = defaultStorage().getItem(key);
  if (cache.raw !== raw) {
    return { raw, ids: readIdList(defaultStorage(), key) };
  }
  return cache;
}

export function getFavoritesSnapshot(): string[] {
  favoritesSnapshot = snapshotFor(FAVORITES_KEY, favoritesSnapshot);
  return favoritesSnapshot.ids;
}

export function getRecentSnapshot(): string[] {
  recentSnapshot = snapshotFor(RECENT_KEY, recentSnapshot);
  return recentSnapshot.ids;
}

// The server/hydration snapshot: no storage on the server, so both lists
// read as the same stable empty list until the client re-syncs.
export function getEmptySnapshot(): string[] {
  return EMPTY_IDS;
}
