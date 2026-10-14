"use client";

// Phone remote UI: connects to the TV session from the QR code, loads the
// song library, and sends RemoteCommands (enqueue / play / dequeue / next).
// Views: Search (filtered browse), Song Book (A–Z browsable list of every
// song with letter-jump navigation), Queue (up next with remove).
// Keep this bundle light: fetch + EventSource only, no synth/player code
// (R-bundle).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import type { RemoteState } from "@/lib/remoteStore";
import type { RemoteCommand } from "@/lib/remoteCommands";
import type { SongMeta } from "@/lib/scanner";
import { filterSongs } from "@/lib/search";
import { branding } from "@/lib/branding";

type View = "search" | "songbook" | "queue";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const OTHER = "#";
/** First-character bucket for the Song Book index; non A–Z titles land in "#". */
function letterOfTitle(title: string): string {
  const c = (title.trim()[0] ?? "").toUpperCase();
  return c >= "A" && c <= "Z" ? c : OTHER;
}

const bigButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
  minWidth: 56,
  padding: "0 16px",
  border: "none",
  borderRadius: 12,
  background: "#1f6feb",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
};

const letterButton: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  border: "none",
  borderRadius: 10,
  background: "#22222e",
  color: "#fafafa",
  fontSize: 15,
  fontWeight: 700,
};

function songLabel(song: SongMeta): string {
  return song.artist ? `${song.title} — ${song.artist}` : song.title;
}

export function RemoteControl() {
  const session = useSearchParams().get("session") ?? "";
  const [songs, setSongs] = useState<SongMeta[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteState | null>(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const letterRefs = useRef(new Map<string, HTMLDivElement>());

  // Load the library (server-cached, fast even on huge collections).
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

  // Subscribe to the TV session's SSE stream (R-session: phone subscribes
  // + sends commands).
  useEffect(() => {
    if (!session) return;
    const es = new EventSource(`/api/remote/${encodeURIComponent(session)}/events`);
    es.addEventListener("open", () => setConnected(true));
    es.addEventListener("message", (event) => {
      try {
        setRemote(JSON.parse(event.data as string) as RemoteState);
        setConnected(true);
      } catch (err) {
        console.error("bad remote state payload:", err);
      }
    });
    es.addEventListener("error", () => setConnected(false));
    return () => es.close();
  }, [session]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const send = useCallback(
    async (cmd: RemoteCommand, feedback?: string) => {
      if (!session) return;
      try {
        const res = await fetch(`/api/remote/${encodeURIComponent(session)}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cmd),
        });
        if (!res.ok) throw new Error(`command failed: ${res.status}`);
        setRemote((await res.json()) as RemoteState);
        if (feedback) showToast(feedback);
      } catch (err) {
        console.error("remote command failed:", err);
        showToast("Could not reach the TV.");
      }
    },
    [session, showToast],
  );

  const enqueue = useCallback(
    (song: SongMeta) => send({ kind: "enqueue", songId: song.id }, `Queued: ${song.title}`),
    [send],
  );
  const playNow = useCallback(
    (song: SongMeta) => send({ kind: "play", songId: song.id }, `Playing: ${song.title}`),
    [send],
  );

  // ---- derived library views ------------------------------------------------
  const songsById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return filterSongs(songs, query).slice(0, 200); // cap renders on huge libraries
  }, [songs, query]);

  // Song Book: whole library sorted by title, bucketed by first letter.
  const songBook = useMemo(() => {
    const sorted = [...songs].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
    const buckets = new Map<string, SongMeta[]>();
    for (const song of sorted) {
      const letter = letterOfTitle(song.title);
      const bucket = buckets.get(letter);
      if (bucket) bucket.push(song);
      else buckets.set(letter, [song]);
    }
    const orderedLetters = [...buckets.keys()].sort((a, b) =>
      a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b),
    );
    return orderedLetters.map((letter) => ({ letter, songs: buckets.get(letter)! }));
  }, [songs]);

  const jumpToLetter = useCallback((letter: string) => {
    setSelectedLetter(letter);
    letterRefs.current.get(letter)?.scrollIntoView({ block: "start" });
  }, []);

  if (!session) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b0b12", color: "#fafafa", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
        <div>
          <h1>{branding.name} Remote</h1>
          <p role="alert">No session id. Scan the QR code on the TV to connect.</p>
        </div>
      </main>
    );
  }

  const current = remote?.currentId ? songsById.get(remote.currentId) : undefined;
  const queueSongs = (remote?.queue ?? [])
    .map((id) => songsById.get(id))
    .filter((s): s is SongMeta => s !== undefined);

  return (
    <main style={{ minHeight: "100vh", background: "#0b0b12", color: "#fafafa", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "12px 16px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{branding.name} Remote</h1>
        <p style={{ margin: 0, fontSize: 13, opacity: connected ? 0.7 : 1, color: connected ? "#fafafa" : "#ffb4ab" }}>
          {connected ? "Connected to TV" : "Connecting to TV…"}
        </p>
      </header>

      {/* Now-playing transport */}
      {remote && (current || remote.queue.length > 0) && (
        <section aria-label="Now playing" style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, background: "#15151f", borderRadius: 12, margin: "0 16px 8px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>{remote.isPlaying ? "Now playing" : "Paused"}</div>
            <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {current ? songLabel(current) : "Nothing playing"}
            </div>
          </div>
          <button
            type="button"
            style={{ ...bigButton, background: "#3a3a4a" }}
            onClick={() => void send({ kind: "pause" }, "Paused")}
          >
            ⏸
          </button>
          <button
            type="button"
            style={{ ...bigButton, background: "#3a3a4a" }}
            onClick={() => void send({ kind: "next" }, "Next song")}
          >
            ⏭
          </button>
        </section>
      )}

      {/* View tabs — prominent Song Book entry */}
      <nav aria-label="Remote views" style={{ display: "flex", gap: 8, padding: "0 16px 8px" }}>
        {(["search", "songbook", "queue"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-current={view === v}
            style={{
              ...bigButton,
              flex: 1,
              background: view === v ? "#1f6feb" : "#22222e",
            }}
          >
            {v === "search" ? "🔍 Search" : v === "songbook" ? "📖 Song Book" : `🎵 Queue${remote && remote.queue.length > 0 ? ` (${remote.queue.length})` : ""}`}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* ---- Search view ---- */}
        {view === "search" && (
          <section aria-label="Search songs" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 16px", flex: 1, minHeight: 0 }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or artist…"
              style={{ minHeight: 48, fontSize: 17, borderRadius: 12, border: "1px solid #333", background: "#15151f", color: "#fafafa", padding: "0 16px" }}
            />
            {libraryError && <p role="alert" style={{ color: "#ffb4ab" }}>{libraryError}</p>}
            {query.trim() && (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                {matches.length} result{matches.length === 1 ? "" : "s"}
              </p>
            )}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {matches.map((song) => (
                <SongRow key={song.id} song={song} onEnqueue={enqueue} onPlay={playNow} />
              ))}
            </ul>
            {!query.trim() && (
              <p style={{ opacity: 0.7, fontSize: 15 }}>
                Type to search {songs.length} songs — or open the <strong>Song Book</strong> to browse A–Z.
              </p>
            )}
          </section>
        )}

        {/* ---- Song Book view: browse the whole library A–Z ---- */}
        {view === "songbook" && (
          <section aria-label="Song Book" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 0 16px", flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
              <button type="button" style={{ ...bigButton, background: "#22222e" }} onClick={() => setView("search")}>
                ← Remote
              </button>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
                Browse all {songs.length} songs — tap a letter to jump
              </p>
            </div>
            {/* Letter jump bar */}
            <div
              aria-label="Jump to letter"
              role="navigation"
              style={{ display: "flex", gap: 6, padding: "0 16px", overflowX: "auto" }}
            >
              {[...LETTERS, OTHER].map((letter) => (
                <button
                  key={letter}
                  type="button"
                  disabled={!songBook.some((b) => b.letter === letter)}
                  style={{
                    ...letterButton,
                    opacity: songBook.some((b) => b.letter === letter) ? 1 : 0.3,
                    background: selectedLetter === letter ? "#1f6feb" : "#22222e",
                  }}
                  onClick={() => jumpToLetter(letter)}
                >
                  {letter}
                </button>
              ))}
            </div>
            {libraryError && <p role="alert" style={{ color: "#ffb4ab", margin: "0 16px" }}>{libraryError}</p>}
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "0 16px" }}>
              {songBook.map(({ letter, songs: bucket }) => (
                <div
                  key={letter}
                  ref={(el) => {
                    if (el) letterRefs.current.set(letter, el);
                    else letterRefs.current.delete(letter);
                  }}
                >
                  <h2 style={{ position: "sticky", top: 0, background: "#0b0b12", margin: "8px 0 4px", padding: "6px 0", fontSize: 18, color: "#9ecbff", scrollMarginTop: 4 }}>
                    {letter} <span style={{ opacity: 0.5, fontSize: 13 }}>({bucket.length})</span>
                  </h2>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {bucket.map((song) => (
                      <SongRow key={song.id} song={song} onEnqueue={enqueue} onPlay={playNow} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---- Queue view ---- */}
        {view === "queue" && (
          <section aria-label="Queue" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 16px", flex: 1, minHeight: 0 }}>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
              {queueSongs.length === 0 ? "Nothing queued yet — add songs from Search or the Song Book." : `${queueSongs.length} song${queueSongs.length === 1 ? "" : "s"} up next`}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {queueSongs.map((song) => (
                <li key={song.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#15151f", borderRadius: 12, padding: "6px 8px 6px 14px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{song.title}</div>
                    {song.artist && <div style={{ fontSize: 13, opacity: 0.7 }}>{song.artist}</div>}
                  </div>
                  <button
                    type="button"
                    style={{ ...bigButton, background: "#3a3a4a", minWidth: 48 }}
                    onClick={() => void send({ kind: "play", songId: song.id }, `Playing: ${song.title}`)}
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    style={{ ...bigButton, background: "#472f2f", minWidth: 48 }}
                    onClick={() => void send({ kind: "dequeue", songId: song.id }, `Removed: ${song.title}`)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {toast && (
        <div role="status" style={{ position: "fixed", left: 16, right: 16, bottom: 16, background: "#1f6feb", color: "#fff", borderRadius: 12, padding: "14px 16px", textAlign: "center", fontSize: 16, fontWeight: 600 }}>
          {toast}
        </div>
      )}
    </main>
  );
}

/** Large-tap-target song row: tap the row to enqueue, ▶ plays immediately. */
function SongRow({
  song,
  onEnqueue,
  onPlay,
}: {
  song: SongMeta;
  onEnqueue: (song: SongMeta) => void;
  onPlay: (song: SongMeta) => void;
}) {
  return (
    <li style={{ display: "flex", alignItems: "stretch", gap: 8, contentVisibility: "auto", containIntrinsicSize: "56px" }}>
      <button
        type="button"
        onClick={() => onEnqueue(song)}
        style={{
          flex: 1,
          minHeight: 56,
          textAlign: "left",
          background: "#15151f",
          color: "#fafafa",
          border: "none",
          borderRadius: 12,
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>{song.title}</span>
        {song.artist && <span style={{ fontSize: 13, opacity: 0.7 }}>{song.artist}</span>}
      </button>
      <button
        type="button"
        aria-label={`Play ${song.title} now`}
        style={{ ...bigButton, background: "#3a3a4a" }}
        onClick={() => onPlay(song)}
      >
        ▶
      </button>
    </li>
  );
}
