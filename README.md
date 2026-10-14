# Kantahub

**Kantahub — Karaoke for your TV. by Eli Dev**

Kantahub is a self-hosted, browser-based karaoke player for your home TV. It plays
**MIDI/KAR** song files (`*.mid`, `*.kar`, `*.midi`) with a **SoundFont**, rendering
audio entirely in the browser. A phone acts as the remote — no app to install.

> **Player-only, personal use.** Kantahub ships **no songs**. You supply your own
> legally obtained MIDI/KAR files and a free SoundFont. It is meant for use on your
> own home network.

---

## What you get

- **TV screen (`/tv`)** — a clean, fullscreen, lyrics-first stage: background video,
  large synchronized lyrics with a karaoke wipe, a compact "now singing / up next"
  overlay, a short queue strip, and a server-synced "starting in 5…" countdown.
- **Controller (`/`)** — open it on any phone, tablet, laptop, or desktop to search,
  enter a song number, build and reorder the queue, set the singer's name, and drive
  playback. No app to install.
- **Songbook** — a TV-remote-friendly song browser (D-pad, paged, song-number keypad)
  that opens as an overlay without stopping the song.
- **Admin (`/admin`)** — fix a song's displayed title/artist/number (persisted as an
  override) and run a library rescan that previews what changed.
- **Realtime room** — current singer, countdown, playback state, queue, and volume
  stay in sync across every connected device over SSE; the TV resyncs on reconnect.
- **LAN IP auto-detection** for the QR code shown on the TV (`PUBLIC_URL` override available).

---

## Requirements

- Docker (with Docker Compose).
- Your own MIDI/KAR song files (`.mid` / `.kar`).
- A SoundFont (`.sf2` / `.sf3` / `.sfogg` / `.dls`). A good free choice is
  [GeneralUser GS](https://schristiancollins.com/generaluser.php).

---

## Quick start

1. **Put your songs and SoundFont in place.** From the project folder, create:

   ```
   songs/   <- your .mid / .kar files (subfolders are scanned)
   sound/   <- your SoundFont, e.g. GeneralUser-GS.sf2
   media/   <- optional background images (.jpg/.png/.webp/.gif) and BGV videos (.mp4/.webm)
   ```

2. **(Optional) configure.** Copy `.env.example` to `.env` if you need to override
   `PUBLIC_URL` or other settings. No secrets are required — Kantahub has no accounts.

3. **Build and run:**

   ```bash
   docker compose up -d --build
   ```

4. **Open the TV screen.** On the TV/PC, browse to `http://<your-host-LAN-IP>:3005/tv`.
   The server prints its network URL on startup; you can also find the host IP with
   `ipconfig` (Windows) or `ip a` (Linux).

   > Kantahub is published on host port **3005** by default (port 3000 was already
   > in use on this machine). Change it with `KANTAHUB_PORT` in `.env`.

5. **Control it.** Scan the QR code on the TV with your phone (same Wi-Fi), or open
   `http://<your-host-LAN-IP>:3005/` on any device. Search, enter a song number, queue
   songs, and press play — the TV shows the countdown, then plays with lyrics.

To stop: `docker compose down`. To update after code changes: `docker compose up -d --build`.

---

## Background media

Drop background images and/or a background video into the `media/` folder (mounted to
`/media`). They are read live from disk — **no rebuild or restart is needed**, just
refresh `/tv`.

- **Video:** `.mp4` or `.webm`. It plays fullscreen (cover), muted, and looping.
- **Images:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` — shown as a slow slideshow.
- **A video wins over images**, and only the **first video in alphabetical order** is
  used. If you keep several, name the one you want first (e.g. `01-bgv.mp4`).
- Media is streamed with HTTP Range support, so large videos can seek and play
  progressively. Even so, a smaller clip (a few tens of MB) starts faster on a TV.

---

## Configuration

`docker-compose.yml` mounts host folders into the container and reads a few environment
variables (see `.env.example`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PUBLIC_URL` | *(auto-detect)* | Absolute LAN URL advertised to the TV/phone, e.g. `http://192.168.1.50:3005`. Set it when auto-detection picks the wrong interface (VPN, Docker bridge). |
| `KANTAHUB_PORT` | `3005` | Host port to publish on (and the container's listening port). |
| `SONGS_DIR` | `/songs` | Your `.mid` / `.kar` library (bind-mounted). |
| `SOUND_DIR` | `/sound` | Your SoundFont (bind-mounted). |
| `MEDIA_DIR` | `/media` | Optional background images/videos (bind-mounted). |
| `INDEX_DIR` | `/index` | Persisted library index cache (named volume) so restarts are fast. |
| `PORT` | `3000` | HTTP port. |

The song/sound/media content is **mounted, never baked into the image**.

---

## Notes

- **No login.** Kantahub runs open on your LAN — anyone on your network can use it.
  Keep it on a trusted home network.
- **Lyrics** are embedded in the MIDI/KAR file itself, so there is no separate lyrics
  database to manage. The TV highlights them from the real playback position; a host
  can nudge the timing with the **Lyrics −/+** controls.
- Large libraries are fine: the library index is cached, so even tens of thousands of
  songs load quickly after the first scan. **The very first start indexes your library
  once** (a few minutes for a very large collection, and the cache is stored in the
  `kantahub-index` volume) — later starts and page loads are fast.
