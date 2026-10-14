"use client";

// TV home shell: brand header, favorites and recently played rows, search +
// song grid, lyric stage, queue, and transport. Selecting a song unlocks
// audio (a click/Enter is a valid gesture), plays it through the store
// (which owns playback state and the engine), records the play in local
// storage, and extracts the embedded lyrics from the streamed file so
// LyricsView can highlight lines in time.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { branding } from "@/lib/branding";
import { extractLyrics, type LyricLine } from "@/lib/lyrics";
import { walkMidiTracks } from "@/lib/midiMeta";
import {
  defaultStorage,
  getEmptySnapshot,
  getFavoritesSnapshot,
  getRecentSnapshot,
  pushRecent,
  subscribeSongLists,
  toggleFavorite,
} from "@/lib/persistence";
import { filterSongs } from "@/lib/search";
import type { SongMeta } from "@/lib/scanner";
import { usePlayer } from "@/components/PlayerProvider";
import { BackgroundMedia } from "@/components/BackgroundMedia";
import { Favorites, RecentlyPlayed } from "@/components/Favorites";
import LyricsView from "@/components/LyricsView";
import { SearchBar } from "@/components/SearchBar";
import { SongGrid } from "@/components/SongGrid";
import { Queue } from "@/components/Queue";
import { Transport } from "@/components/Transport";

const DEFAULT_US_PER_QUARTER = 500_000; // MIDI default tempo: 120 BPM

interface TempoEvent {
  ticks: number;
  usPerQuarter: number;
}

// Build a tick-to-seconds converter from the file's tempo map (FF 51 events)
// and its ticks-per-quarter header. SMPTE files (ticksPerQuarter === 0) have
// no usable map; NaN keeps the highlight from guessing wrong timings.
function makeTicksToSeconds(
  tempos: TempoEvent[],
  ticksPerQuarter: number,
): (ticks: number) => number {
  if (ticksPerQuarter <= 0) return () => Number.NaN;
  const segments: TempoEvent[] = [];
  for (const t of [...tempos].sort((a, b) => a.ticks - b.ticks)) {
    const last = segments[segments.length - 1];
    if (last && t.ticks === last.ticks) last.usPerQuarter = t.usPerQuarter; // later event wins
    else segments.push({ ticks: t.ticks, usPerQuarter: t.usPerQuarter });
  }
  if (segments.length === 0 || segments[0].ticks > 0) {
    segments.unshift({ ticks: 0, usPerQuarter: DEFAULT_US_PER_QUARTER });
  }
  return (ticks: number) => {
    let sec = 0;
    for (let i = 0; i < segments.length; i++) {
      const start = segments[i].ticks;
      const end = i + 1 < segments.length ? segments[i + 1].ticks : Infinity;
      const upto = Math.min(ticks, end);
      sec += ((upto - start) / ticksPerQuarter) * (segments[i].usPerQuarter / 1_000_000);
      if (ticks <= end) break;
    }
    return sec;
  };
}

// Fetch the song file and extract timed display lines. Never throws: any
// failure (network, corrupt file) yields [] and LyricsView shows the
// instrumental state.
async function loadLyricLines(id: string): Promise<LyricLine[]> {
  try {
    const res = await fetch(`/api/songs/${encodeURIComponent(id)}/file`);
    if (!res.ok) throw new Error(`failed to fetch song ${id}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const tempos: TempoEvent[] = [];
    const { ticksPerQuarter } = walkMidiTracks(buf, {
      onMeta(type, data, ticks) {
        if (type === 0x51 && data.length >= 3) {
          tempos.push({ ticks, usPerQuarter: (data[0] << 16) | (data[1] << 8) | data[2] });
        }
      },
    });
    return extractLyrics(buf, makeTicksToSeconds(tempos, ticksPerQuarter));
  } catch (err) {
    console.error("lyric extraction failed:", err);
    return [];
  }
}

export function TvShell() {
  const { state, store, engine, unlockAudio } = usePlayer();
  const [songs, setSongs] = useState<SongMeta[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<SongMeta[]>([]);
  // localStorage is the source of truth for favorites and recents; the
  // external-store subscription re-renders on every persist. Rows resolve
  // the ids against the loaded library, so ids from a library that has
  // since changed simply drop out.
  const favoriteIds = useSyncExternalStore(subscribeSongLists, getFavoritesSnapshot, getEmptySnapshot);
  const recentIds = useSyncExternalStore(subscribeSongLists, getRecentSnapshot, getEmptySnapshot);
  // Lyrics are keyed by song id so a stale response never clobbers the
  // newly selected song's display.
  const [lyricState, setLyricState] = useState<{ id: string | null; lines: LyricLine[] }>({
    id: null,
    lines: [],
  });
  // A selection made while the engine is still booting (first gesture of the
  // session) is parked here and replayed once PlayerProvider attaches it.
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/songs");
        if (!res.ok) throw new Error(`/api/songs failed: ${res.status}`);
        const data = (await res.json()) as SongMeta[];
        if (!cancelled) setSongs(data);
      } catch (err) {
        console.error("library load failed:", err);
        if (!cancelled) setLibraryError("The song library failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Favorites toggle against the store itself (the source of truth) so
  // rapid double activations still end in the correct stored state.
  const toggleFavoriteById = useCallback((song: SongMeta) => {
    toggleFavorite(defaultStorage(), song.id);
  }, []);

  const isFavorite = useCallback(
    (songId: string) => favoriteIds.includes(songId),
    [favoriteIds],
  );

  const playNow = useCallback(
    (song: SongMeta) => {
      unlockAudio();
      if (engine) store.playSong(song.id);
      else pendingRef.current = song.id;
      // Record after playback is underway (or parked): even a storage that
      // rejects writes can never preempt the song. A replay just moves it
      // back to the front.
      pushRecent(defaultStorage(), song.id);
    },
    [unlockAudio, engine, store],
  );

  useEffect(() => {
    if (!engine || !pendingRef.current) return;
    const id = pendingRef.current;
    pendingRef.current = null;
    store.playSong(id);
  }, [engine, store]);

  // Extract lyrics whenever the store starts a (different) song.
  useEffect(() => {
    const id = state.currentId;
    if (!id) return;
    let cancelled = false;
    void loadLyricLines(id).then((lines) => {
      if (!cancelled) setLyricState({ id, lines });
    });
    return () => {
      cancelled = true;
    };
  }, [state.currentId]);

  const enqueue = useCallback((song: SongMeta) => {
    setQueue((q) => [...q, song]);
  }, []);

  const playFromQueue = useCallback(
    (song: SongMeta, index: number) => {
      setQueue((q) => q.filter((_, i) => i !== index));
      playNow(song);
    },
    [playNow],
  );

  const removeFromQueue = useCallback((index: number) => {
    setQueue((q) => q.filter((_, i) => i !== index));
  }, []);

  const playNext = useCallback(() => {
    const next = queue[0];
    if (!next) return;
    setQueue((q) => q.slice(1));
    playNow(next);
  }, [queue, playNow]);

  const onPlayPause = useCallback(() => {
    unlockAudio();
    if (state.isPlaying) store.pause();
    // Resume: the engine's "state" event flips the store back to playing.
    else engine?.play();
  }, [unlockAudio, state.isPlaying, store, engine]);

  const visible = filterSongs(songs, query);
  const songsById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const resolveIds = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => songsById.get(id))
        .filter((song): song is SongMeta => song !== undefined),
    [songsById],
  );
  const favoriteSongs = useMemo(() => resolveIds(favoriteIds), [favoriteIds, resolveIds]);
  const recentSongs = useMemo(() => resolveIds(recentIds), [recentIds, resolveIds]);
  const lines = lyricState.id === state.currentId ? lyricState.lines : [];
  const current = songs.find((s) => s.id === state.currentId);
  const currentTitle = current
    ? `${current.title}${current.artist ? ` — ${current.artist}` : ""}`
    : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0b0b12",
        color: "#fafafa",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "1.2vh 3vw 0",
        }}
      >
        <h1 style={{ fontSize: "2.2vw", fontWeight: 800, margin: 0 }}>{branding.name}</h1>
        <p style={{ fontSize: "1.1vw", opacity: 0.7, margin: 0 }}>
          {songs.length} songs{query ? ` — ${visible.length} matching` : ""}
        </p>
      </header>

      {(favoriteSongs.length > 0 || recentSongs.length > 0) && (
        <section
          aria-label="Favorites and recently played"
          style={{ padding: "0.9vh 3vw 0", display: "flex", flexDirection: "column", gap: "1vh" }}
        >
          <Favorites songs={favoriteSongs} onPlay={playNow} />
          <RecentlyPlayed songs={recentSongs} onPlay={playNow} />
        </section>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: "2vw",
          padding: "1.5vh 3vw",
        }}
      >
        <section
          aria-label="Song library"
          style={{ width: "34vw", display: "flex", flexDirection: "column", gap: "1.2vh", minHeight: 0 }}
        >
          <SearchBar value={query} onChange={setQuery} />
          {libraryError && (
            <p role="alert" style={{ color: "#ff8a80", fontSize: "1.2vw" }}>
              {libraryError}
            </p>
          )}
          <SongGrid
            songs={visible}
            onPlay={playNow}
            onQueue={enqueue}
            onToggleFavorite={toggleFavoriteById}
            isFavorite={isFavorite}
          />
        </section>

        <section
          aria-label="Lyrics"
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            background: "#000",
            borderRadius: "1vw",
            overflow: "hidden",
          }}
        >
          <BackgroundMedia />
          <LyricsView lines={lines} timeSec={state.positionSec} />
        </section>

        <section aria-label="Queue" style={{ width: "20vw", minHeight: 0, overflowY: "auto" }}>
          <Queue queue={queue} onPlay={playFromQueue} onRemove={removeFromQueue} />
        </section>
      </div>

      <Transport
        isPlaying={state.isPlaying}
        hasSong={state.currentId !== null}
        hasNext={queue.length > 0}
        title={currentTitle}
        onPrev={() => store.seek(0)}
        onPlayPause={onPlayPause}
        onStop={() => store.stop()}
        onNext={playNext}
      />

      <footer
        style={{
          textAlign: "center",
          fontSize: "1vw",
          opacity: 0.6,
          padding: "0 3vw 1.2vh",
        }}
      >
        {branding.footerTagline}
      </footer>
    </main>
  );
}
