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

- **TV screen** — browse/search your library, big highlighted lyrics, transport, queue.
- **Phone remote** — scan a QR code on the TV, then search, queue, and control playback
  from your phone. Includes a **Song Book** to browse the whole library A–Z (no need to
  know a song number).
- **Karaoke controls** — guide-melody mute, key transpose, tempo, volume.
- **Party flow** — favorites, recently played, auto-advance with a countdown, M3U import,
  a cosmetic fun score, and background slideshow/BGV video.
- **LAN IP auto-detection** for the phone-remote QR (`PUBLIC_URL` override available).

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

4. **Open it.** On the same TV/PC, browse to `http://<your-host-LAN-IP>:3005`.
   The server prints its network URL on startup; you can also find the host IP with
   `ipconfig` (Windows) or `ip a` (Linux).

   > Kantahub is published on host port **3005** by default (port 3000 was already
   > in use on this machine). Change it with `KANTAHUB_PORT` in `.env`.

5. **Phone remote.** On the TV screen, scan the QR code with your phone (same Wi-Fi).
   The phone opens the remote — search, use the **Song Book**, and queue songs. The TV plays.

To stop: `docker compose down`. To update after code changes: `docker compose up -d --build`.

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
  database to manage.
- **Scoring is cosmetic.** The fun score at song end is randomized for entertainment;
  Kantahub never captures your microphone.
- Large libraries are fine: the library index is cached, so even tens of thousands of
  songs load quickly after the first scan. **The very first start indexes your library
  once** (a few minutes for a very large collection, and the cache is stored in the
  `kantahub-index` volume) — later starts and page loads are fast.
