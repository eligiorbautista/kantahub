import { describe, it, expect } from "vitest";
import {
  defaultStorage,
  getEmptySnapshot,
  getFavoritesSnapshot,
  loadFavorites,
  loadRecent,
  pushRecent,
  subscribeSongLists,
  toggleFavorite,
} from "@/lib/persistence";

const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

describe("persistence", () => {
  it("toggles favorites on and off", () => {
    expect(toggleFavorite(storage, "a")).toEqual(["a"]);
    expect(toggleFavorite(storage, "a")).toEqual([]);
  });
  it("keeps recent songs newest-first without duplicates", () => {
    pushRecent(storage, "a"); pushRecent(storage, "b"); pushRecent(storage, "a");
    expect(JSON.parse(mem.get("kantahub.recent")!)).toEqual(["a", "b"]);
  });
});

// Additional coverage for the readers the TV rows use; a fresh stub per
// expectation keeps these independent of the shared storage above.
const makeStorage = () => {
  const mem = new Map<string, string>();
  return {
    mem,
    storage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    },
  };
};

describe("persistence storage format", () => {
  it("stores favorites under kantahub.favorites and reads them back in order", () => {
    const { mem, storage } = makeStorage();
    toggleFavorite(storage, "b");
    toggleFavorite(storage, "a");
    expect(JSON.parse(mem.get("kantahub.favorites")!)).toEqual(["b", "a"]);
    expect(loadFavorites(storage)).toEqual(["b", "a"]);
  });

  it("reads a missing or corrupt store as an empty list", () => {
    const { storage } = makeStorage();
    expect(loadFavorites(storage)).toEqual([]);
    expect(loadRecent(storage)).toEqual([]);
    storage.setItem("kantahub.favorites", "not json");
    storage.setItem("kantahub.recent", JSON.stringify({ nope: true }));
    expect(loadFavorites(storage)).toEqual([]);
    expect(loadRecent(storage)).toEqual([]);
  });

  it("returns the updated recent list from pushRecent", () => {
    const { storage } = makeStorage();
    expect(pushRecent(storage, "a")).toEqual(["a"]);
    expect(pushRecent(storage, "b")).toEqual(["b", "a"]);
    expect(loadRecent(storage)).toEqual(["b", "a"]);
  });
});

// The external-store binding the TV rows subscribe to; these run against
// defaultStorage()'s memory fallback (node has no window). Each test puts
// the shared store back the way it found it.
describe("persistence external store", () => {
  it("notifies subscribers on mutations and stops after unsubscribe", () => {
    const storage = defaultStorage();
    const seen: string[][] = [];
    const unsubscribe = subscribeSongLists(() => seen.push(getFavoritesSnapshot()));
    try {
      toggleFavorite(storage, "f1");
      expect(getFavoritesSnapshot()).toEqual(["f1"]);
      expect(seen).toEqual([["f1"]]);
    } finally {
      unsubscribe();
    }
    toggleFavorite(storage, "f1"); // no listener: just cleanup
    expect(getFavoritesSnapshot()).toEqual([]);
    expect(seen).toEqual([["f1"]]);
  });

  it("keeps the snapshot identity stable while nothing changes", () => {
    const storage = defaultStorage();
    toggleFavorite(storage, "s1");
    try {
      expect(getFavoritesSnapshot()).toBe(getFavoritesSnapshot());
    } finally {
      toggleFavorite(storage, "s1");
    }
    expect(getFavoritesSnapshot()).toEqual([]);
  });

  it("serves a stable empty list as the server snapshot", () => {
    expect(getEmptySnapshot()).toEqual([]);
    expect(getEmptySnapshot()).toBe(getEmptySnapshot());
  });
});
