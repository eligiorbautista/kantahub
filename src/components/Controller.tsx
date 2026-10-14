"use client";

// src/components/Controller.tsx
// The controller screen (/): search songs, enter song numbers, build and manage
// the queue, and drive playback from a phone, tablet, laptop, or desktop. It
// holds no audio — the TV display (/tv) plays the music — it just sends room
// commands and mirrors the shared state.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRoom } from "@/lib/useRoom";
import { ROOM_ID } from "@/lib/room";
import { searchSongs, resolveSongs, songLabel } from "@/lib/songsClient";
import type { SongMeta } from "@/lib/scanner";
import { branding } from "@/lib/branding";
import { useReloadOnDemand } from "@/lib/useReloadOnDemand";
import { Songbook } from "@/components/Songbook";
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  StopIcon,
  SearchIcon,
  BookIcon,
  CloseIcon,
} from "@/components/Icons";

const PAGE_SIZE = 40;

export function Controller() {
  const { state: room, send, connected } = useRoom(ROOM_ID);

  // A "refresh all" from any controller reloads every device, including this one.
  useReloadOnDemand(room?.reloadNonce);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [songbookOpen, setSongbookOpen] = useState(false);
  const [songsById, setSongsById] = useState<Map<string, SongMeta>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced paged search.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      searchSongs(query, PAGE_SIZE, offset)
        .then((page) => {
          if (cancelled) return;
          setResults(page.items);
          setTotal(page.total);
        })
        .catch((err) => console.error("search failed:", err))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, offset]);

  // Resolve queue entries to metadata.
  useEffect(() => {
    const ids = (room?.queue ?? []).map((e) => e.songId);
    const missing = ids.filter((id) => !songsById.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void resolveSongs(missing).then((songs) => {
      if (cancelled) return;
      setSongsById((prev) => {
        const next = new Map(prev);
        for (const s of songs) next.set(s.id, s);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [room, songsById]);

  const queuedIds = useMemo(() => new Set((room?.queue ?? []).map((e) => e.songId)), [room?.queue]);

  const remember = useCallback((song: SongMeta) => {
    setSongsById((prev) => new Map(prev).set(song.id, song));
  }, []);

  const addSong = useCallback(
    async (song: SongMeta) => {
      if (queuedIds.has(song.id)) {
        setFeedback("Already in queue");
        return "duplicate" as const;
      }
      remember(song);
      const next = await send({ kind: "enqueue", songId: song.id });
      if (!next) {
        setFeedback("Song not found");
        return "error" as const;
      }
      setFeedback(`Added “${song.title}” to the queue`);
      return "added" as const;
    },
    [queuedIds, send, remember],
  );

  const playNow = useCallback(
    (song: SongMeta) => {
      remember(song);
      void send({ kind: "play", songId: song.id });
      setFeedback("Now playing");
    },
    [send, remember],
  );

  const currentSong = room?.currentId ? songsById.get(room.currentId) : undefined;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <main
      className="ctl"
      style={{
        flex: 1,
        background: "#0b0b12",
        color: "#fafafa",
        boxSizing: "border-box",
      }}
    >
      <header className="ctl-header" style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>{branding.name}</h1>
          <span style={{ fontSize: "0.72rem", opacity: 0.6, letterSpacing: "0.08em" }}>{branding.byline}</span>
        </div>
        <div className={connected ? "kh-status" : "kh-status offline"} style={{ marginLeft: "0.6rem" }}>
          <span
            className={connected ? "kh-status-dot" : "kh-status-dot offline"}
            title={connected ? "Connected to the room" : "Reconnecting…"}
          />
          <span>{connected ? "Online" : "Offline"}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm("Reload every device and clear their caches?")) return;
            void send({ kind: "reloadAll" });
          }}
          style={{ ...btn, marginLeft: "auto", fontSize: "0.85rem", padding: "0.35rem 0.7rem" }}
        >
          Refresh all
        </button>
        <a href="/tv" style={{ color: "#93c5fd", fontSize: "0.9rem" }}>
          TV screen
        </a>
        <a href="/admin" style={{ color: "#93c5fd", fontSize: "0.9rem" }}>
          Admin
        </a>
      </header>

      {/* Now playing + transport */}
      <section className="ctl-now" style={card}>
        <p style={{ margin: 0, fontSize: "0.8rem", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
          Now Singing
        </p>
        <p style={{ margin: "0.2rem 0 0.8rem", fontSize: "1.3rem", fontWeight: 800 }}>
          {room?.currentId
            ? `${room.currentSinger ? `${room.currentSinger} — ` : ""}${songLabel({
                title: currentSong?.title ?? "…",
                artist: currentSong?.artist ?? "",
              })}`
            : "Nothing playing"}
        </p>
        {room?.phase === "score" && room.score && (
          <p style={{ margin: "0 0 0.8rem", fontSize: "0.95rem", color: "#fbbf24", fontWeight: 700 }}>
            Score {room.score.value} — {room.score.reaction}
            {room.queue.length > 0 ? " · next song coming up" : " · queue is empty"}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => void send({ kind: "restart" })} style={btn} aria-label="Restart">
            <PrevIcon size={20} /> Restart
          </button>
          <button
            type="button"
            onClick={() => void send({ kind: room?.isPlaying ? "pause" : "resume" })}
            style={btnPrimary}
            aria-label={room?.isPlaying ? "Pause" : "Play"}
          >
            {room?.isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            {room?.isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => void send({ kind: "next" })} style={btn} aria-label="Next">
            <NextIcon size={20} /> Next
          </button>
          <button type="button" onClick={() => void send({ kind: "stop" })} style={btn} aria-label="Stop">
            <StopIcon size={20} /> Stop
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
            <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={room?.volume ?? 0.8}
              onChange={(e) => void send({ kind: "setVolume", volume: Number(e.target.value) })}
              style={{ width: "8rem" }}
            />
          </label>
        </div>
      </section>

      {/* Search + add songs (one box: title, artist, or song number) */}
      <section className="ctl-search" style={card}>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 14rem" }}>
            <span style={{ position: "absolute", left: "0.6rem", top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>
              <SearchIcon size={18} />
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOffset(0);
              }}
              placeholder="Search title, artist, or song number…"
              style={{ ...input, paddingLeft: "2.2rem" }}
            />
          </div>
          <button type="button" onClick={() => setSongbookOpen(true)} style={btn}>
            <BookIcon size={18} /> Songbook
          </button>
        </div>

        {feedback && (
          <p role="status" style={{ margin: "0.6rem 0 0", fontSize: "0.9rem", color: "#93c5fd" }}>
            {feedback}
          </p>
        )}

        <ul
          className="ctl-scroll"
          style={{ listStyle: "none", margin: "0.8rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
          {results.map((song) => {
            const inQueue = queuedIds.has(song.id);
            return (
              <li key={song.id}>
                <div className="ctl-row">
                  <span style={{ opacity: 0.55, minWidth: "4.5ch", textAlign: "right", fontSize: "0.85rem" }}>
                    {song.number ?? "—"}
                  </span>
                  <span className="ctl-title">{songLabel(song)}</span>
                  {inQueue && <span style={{ color: "#4ade80", fontSize: "0.8rem" }}>In queue</span>}
                  <button type="button" onClick={() => void addSong(song)} style={btnSmall}>
                    Add
                  </button>
                  <button type="button" onClick={() => playNow(song)} style={btnSmallAlt}>
                    Play
                  </button>
                </div>
              </li>
            );
          })}
          {!loading && results.length === 0 && (
            <li style={{ opacity: 0.6, fontSize: "0.95rem" }}>No songs match “{query}”.</li>
          )}
        </ul>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginTop: "0.8rem" }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            style={page <= 1 ? btnDisabled : btnSmall}
          >
            Prev
          </button>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            Page {page} / {pageCount} · {total} songs
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            style={page >= pageCount ? btnDisabled : btnSmall}
          >
            Next
          </button>
        </div>
      </section>

      {/* Queue */}
      <section className="ctl-queue" style={card}>
        <h2 style={{ margin: "0 0 0.6rem", fontSize: "1.1rem" }}>
          Queue ({room?.queue.length ?? 0})
        </h2>
        {(room?.queue.length ?? 0) === 0 ? (
          <p style={{ opacity: 0.6, margin: 0 }}>The queue is empty.</p>
        ) : (
          <ol
            className="ctl-scroll"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {room!.queue.map((entry, i) => {
              const song = songsById.get(entry.songId);
              return (
                <li key={`${entry.songId}-${i}`}>
                  <div className="ctl-row">
                    <span style={{ opacity: 0.6, minWidth: "2ch", textAlign: "right" }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {song ? songLabel(song) : entry.songId}
                      </span>
                      {entry.singer && <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>{entry.singer}</span>}
                    </span>
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => void send({ kind: "reorder", from: i, to: i - 1 })}
                      style={i === 0 ? btnDisabled : btnSmall}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === room!.queue.length - 1}
                      onClick={() => void send({ kind: "reorder", from: i, to: i + 1 })}
                      style={i === room!.queue.length - 1 ? btnDisabled : btnSmall}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => void send({ kind: "play", songId: entry.songId, singer: entry.singer })}
                      style={btnSmallAlt}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => void send({ kind: "dequeue", index: i })}
                      style={btnSmall}
                    >
                      <CloseIcon size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {(room?.queue.length ?? 0) > 0 && (
          <button type="button" onClick={() => void send({ kind: "clearQueue" })} style={{ ...btn, marginTop: "0.8rem" }}>
            Clear queue
          </button>
        )}
      </section>

      {songbookOpen && (
        <Songbook
          queuedIds={queuedIds}
          onAdd={addSong}
          onPlayNow={playNow}
          onClose={() => setSongbookOpen(false)}
          performing={room?.phase === "countdown" || !!room?.isPlaying}
          feedback={feedback}
        />
      )}
    </main>
  );
}

const card: CSSProperties = {
  background: "#14141f",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0.8rem",
  padding: "1rem",
};

const input: CSSProperties = {
  background: "#0b0b12",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "0.5rem",
  padding: "0.6rem 0.8rem",
  color: "#fafafa",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
};

const btn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  background: "rgba(255,255,255,0.1)",
  color: "#fafafa",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.9rem",
  fontSize: "0.95rem",
  cursor: "pointer",
};

const btnPrimary: CSSProperties = {
  ...btn,
  background: "#3b82f6",
  borderColor: "#3b82f6",
  fontWeight: 700,
};

const btnSmall: CSSProperties = {
  ...btn,
  padding: "0.35rem 0.6rem",
  fontSize: "0.85rem",
};

const btnSmallAlt: CSSProperties = {
  ...btnSmall,
  background: "#ef4444",
  borderColor: "#ef4444",
};

const btnDisabled: CSSProperties = {
  ...btnSmall,
  opacity: 0.4,
  cursor: "default",
};

export default Controller;
