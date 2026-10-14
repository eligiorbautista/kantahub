"use client";

// src/components/AdminPanel.tsx
// Host/admin screen (/admin): edit the displayed title/artist/number for a
// file (persisted as an override that survives rescans) and run a library
// rescan that re-parses every entry and previews the changes.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { SongMeta } from "@/lib/scanner";
import { searchSongs, songLabel } from "@/lib/songsClient";
import { branding } from "@/lib/branding";

interface RescanStatus {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  total: number;
  changed: number;
  sample: Array<{ id: string; fileName: string; from: { title: string; artist: string } | null; to: { title: string; artist: string } }>;
  error?: string;
}

export function AdminPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongMeta[]>([]);
  const [selected, setSelected] = useState<SongMeta | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [rescan, setRescan] = useState<RescanStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchSongs(query, 20, 0)
        .then((page) => {
          if (!cancelled) setResults(page.items);
        })
        .catch((err) => console.error("admin search failed:", err));
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const choose = useCallback((song: SongMeta) => {
    setSelected(song);
    setTitle(song.title);
    setArtist(song.artist);
    setNumber(song.number ?? "");
    setStatus(null);
  }, []);

  const save = useCallback(async () => {
    if (!selected) return;
    const res = await fetch("/api/overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, title, artist, number }),
    });
    setStatus(res.ok ? "Saved override" : "Save failed");
    if (res.ok) {
      const next = { ...selected, title, artist, number: number || undefined };
      setSelected(next);
    }
  }, [selected, title, artist, number]);

  const reset = useCallback(async () => {
    if (!selected) return;
    const res = await fetch(`/api/overrides?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    setStatus(res.ok ? "Override cleared" : "Clear failed");
  }, [selected]);

  const startRescan = useCallback(async () => {
    const res = await fetch("/api/rescan", { method: "POST" });
    if (res.ok) setRescan((await res.json()) as RescanStatus);
  }, []);

  // Poll while a rescan runs.
  useEffect(() => {
    if (!rescan?.running) return;
    const t = window.setInterval(() => {
      void fetch("/api/rescan")
        .then((r) => r.json())
        .then((s: RescanStatus) => setRescan(s))
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(t);
  }, [rescan?.running]);

  return (
    <main style={page}>
      <header style={{ display: "flex", alignItems: "baseline", gap: "0.8rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>{branding.name} Admin</h1>
        <Link href="/" style={{ color: "#93c5fd", fontSize: "0.9rem" }}>
          ← Controller
        </Link>
        <a href="/tv" style={{ color: "#93c5fd", fontSize: "0.9rem" }}>
          TV
        </a>
      </header>

      <section style={card}>
        <h2 style={{ margin: "0 0 0.6rem", fontSize: "1.05rem" }}>Fix a song&apos;s title / artist / number</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library…"
          style={input}
        />
        <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.3rem", maxHeight: "16rem", overflowY: "auto" }}>
          {results.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => choose(song)}
                style={{
                  ...rowBtn,
                  borderColor: selected?.id === song.id ? "#3b82f6" : "rgba(255,255,255,0.12)",
                }}
              >
                <span style={{ opacity: 0.55, minWidth: "4.5ch", textAlign: "right", fontSize: "0.8rem" }}>
                  {song.number ?? "—"}
                </span>
                <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {songLabel(song)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selected && (
          <div style={{ marginTop: "0.9rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.6, wordBreak: "break-all" }}>
              {selected.fileName}
            </p>
            <label style={field}>
              <span style={label}>Song number</span>
              <input value={number} onChange={(e) => setNumber(e.target.value)} style={input} />
            </label>
            <label style={field}>
              <span style={label}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
            </label>
            <label style={field}>
              <span style={label}>Artist</span>
              <input value={artist} onChange={(e) => setArtist(e.target.value)} style={input} />
            </label>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button type="button" onClick={() => void save()} style={btnPrimary}>
                Save override
              </button>
              <button type="button" onClick={() => void reset()} style={btn}>
                Clear override
              </button>
            </div>
            {status && <p style={{ margin: 0, color: "#93c5fd", fontSize: "0.9rem" }}>{status}</p>}
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: "0 0 0.6rem", fontSize: "1.05rem" }}>Library rescan</h2>
        <p style={{ margin: "0 0 0.6rem", opacity: 0.75, fontSize: "0.9rem" }}>
          Re-parses every file with the current metadata rules and reports what changed. No files are deleted;
          original paths are kept. A full scan of a large library takes several minutes.
        </p>
        <button type="button" onClick={() => void startRescan()} disabled={rescan?.running} style={rescan?.running ? btnDisabled : btnPrimary}>
          {rescan?.running ? "Scanning…" : "Start rescan"}
        </button>
        {rescan && (
          <div style={{ marginTop: "0.8rem", fontSize: "0.9rem" }}>
            <p style={{ margin: 0 }}>
              {rescan.running
                ? "Running…"
                : rescan.error
                  ? `Error: ${rescan.error}`
                  : `Done — ${rescan.changed} of ${rescan.total} songs changed.`}
            </p>
            {rescan.sample.length > 0 && (
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", maxHeight: "14rem", overflowY: "auto" }}>
                {rescan.sample.map((c) => (
                  <li key={c.id} style={{ marginBottom: "0.25rem" }}>
                    <span style={{ opacity: 0.6 }}>{c.fileName}</span>
                    <br />
                    <span style={{ opacity: 0.7 }}>{c.from ? songLabel(c.from) : "(new)"}</span> →{" "}
                    <b>{songLabel(c.to)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  background: "#0b0b12",
  color: "#fafafa",
  padding: "1.6rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.2rem",
  maxWidth: "56rem",
  margin: "0 auto",
  boxSizing: "border-box",
};

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
  padding: "0.55rem 0.8rem",
  color: "#fafafa",
  fontSize: "0.95rem",
  width: "100%",
  boxSizing: "border-box",
};

const field: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const label: CSSProperties = { fontSize: "0.8rem", opacity: 0.7 };

const rowBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "0.5rem",
  padding: "0.45rem 0.7rem",
  color: "#fafafa",
  fontSize: "0.9rem",
  cursor: "pointer",
};

const btn: CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  color: "#fafafa",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.9rem",
  fontSize: "0.9rem",
  cursor: "pointer",
};

const btnPrimary: CSSProperties = { ...btn, background: "#3b82f6", borderColor: "#3b82f6", fontWeight: 700 };
const btnDisabled: CSSProperties = { ...btn, opacity: 0.5, cursor: "default" };

export default AdminPanel;
