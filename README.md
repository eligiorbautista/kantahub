# Kantahub

**Self-hosted browser karaoke for your home TV.**

Kantahub plays **MIDI / KAR** karaoke files (`*.mid`, `*.midi`, `*.kar`) with a
**SoundFont**, and shows synchronized lyrics on a TV or any browser. A phone acts
as the remote — there is nothing to install on either device.

> **Bring your own songs.** Kantahub ships **no music**. You supply your own
> legally obtained MIDI/KAR files and a free SoundFont. It is built for a trusted
> home network: there is no login, and anyone on your LAN can use it.

---

## Features

- **TV screen (`/tv`)** — a fullscreen, lyrics-first stage: background video or
  image slideshow, large synchronized lyrics with a karaoke wipe, "now singing /
  up next", a queue strip, and a post-song score screen with confetti.
- **Controller (`/`)** — any phone, tablet or laptop: search by title, artist or
  song number, build and reorder the queue, and drive playback (play/pause, next,
  restart, stop, volume).
- **Songbook** — a TV-remote-friendly browser (D-pad, paged results, numeric
  keypad) that opens as an overlay without stopping the song.
- **Admin (`/admin`)** — fix a song's displayed title/artist/number, nudge the TV
  lyric timing, and run a library rescan.
- **Idle music and a score cheer** — optional background tracks while nothing is
  playing, and a cheer sound that plays with the score.
- **Realtime room** — the song on stage, playback state, queue and volume stay in
  sync across every device over Server-Sent Events.
- **No accounts, no cloud, no telemetry** — everything runs in one container.

---

## Requirements

- **Docker** with Docker Compose.
- **Your own MIDI/KAR files** (`.mid`, `.midi`, `.kar`).
- **A SoundFont** (`.sf2`, `.sf3`, `.sfogg`, `.dls`) — [GeneralUser GS](https://schristiancollins.com/generaluser.php) is a good free choice.
- Optional: background images/videos and background music.

---

## Quick start

1. **Create the content folders** next to `docker-compose.yml`:

   ```
   songs/   <- your .mid / .midi / .kar files (subfolders are scanned)
   sound/   <- your SoundFont, e.g. GeneralUser-GS.sf2
   media/   <- optional background images and/or one background video
   music/   <- optional idle music, and cheer*.mp3 for the score cheer
   ```

   Only `songs/` and `sound/` are needed to sing; Docker creates missing folders
   on first start.

2. **(Optional) configure.** Copy `.env.example` to `.env` to change the port or
   set `PUBLIC_URL`. No secrets are required.

3. **Build and run:**

   ```bash
   docker compose up -d --build
   ```

4. **Open the TV screen** on your TV or PC browser:

   ```
   http://<your-server-LAN-IP>:3005/tv
   ```

   Find the LAN IP with `ipconfig` (Windows) or `ip a` (Linux).

5. **Control it** — scan the QR code shown on the TV with your phone (same
   Wi-Fi), or open `http://<your-server-LAN-IP>:3005/`.

   > **One press to start sound.** Browsers refuse to play audio until a page has
   > had a real interaction, so press any key on the TV remote (or tap the
   > screen) once. After that everything is automatic. See
   > [Audio on a TV](#audio-on-a-tv) to remove even that press.

To stop: `docker compose down`. To update: `docker compose up -d --build`.

---

## Your content folders

| Folder | What goes in | Formats | Notes |
|---|---|---|---|
| `songs/` | your karaoke library | `.mid`, `.midi`, `.kar` | Subfolders are scanned. Titles and artists come from the **filename** (`"00123 - Title - Artist.mid"`), falling back to embedded MIDI metadata. |
| `sound/` | one SoundFont | `.sf2`, `.sf3`, `.sfogg`, `.dls` | The first supported file found is used. Required for playback. |
| `media/` | background visuals | images: `.jpg` `.jpeg` `.png` `.webp` `.gif` · video: `.mp4` `.webm` | If any video exists, the **first one alphabetically** plays (name it `01-bgv.mp4` to choose). Otherwise the images run as a slow slideshow. |
| `music/` | idle music + score cheer | `.mp3` `.m4a` `.aac` `.ogg` `.oga` `.wav` `.flac` | A file whose name **starts with `cheer`** is the score cheer; everything else is idle background music (played shuffled, at 60% of the room volume). |

`media/` and `music/` are read **live** — drop files in and refresh the TV, no
rebuild or restart. The **score lasts exactly as long as your cheer file**
(clamped to 5–25 seconds), so the cheer and the score finish together. Without a
cheer file the score runs for 8 seconds.

### Song files

Lyrics must be **embedded in the file** — the standard `FF 05` lyric meta events
used by `.kar` files and most karaoke MIDI. There is no separate lyrics database.
Files without lyrics still play; the TV shows "Instrumental — no lyrics".

---

## How it works

- **`/tv`** is the only screen that produces audio; it owns the player.
- **`/`** (and `/remote`) is a controller: it holds no audio and simply sends room
  commands.
- A single in-memory **room** holds the queue, the song on stage, the playback
  state and the volume; every device follows it over Server-Sent Events.
- The **library index** is built once and cached in the `kantahub-index` volume,
  so a large collection (tens of thousands of files) loads quickly afterwards.
  The very first scan of a big library takes a few minutes.

---

## Audio on a TV

Browsers only expose the **Web Audio worklet** (used by the in-browser synth) in a
*secure context*. `http://localhost` counts as secure; a plain
`http://192.168.1.2:3005` does not. On such an origin the TV screen plays
**server-rendered audio** instead:

- The server renders the song once with **FluidSynth** (a few seconds) and caches
  it, so the TV only needs a plain `<audio>` element — no worklet, no
  certificate.
- The **first play of a song** therefore waits a moment for that render. It is
  warmed in the background as soon as a song is queued, and cached afterwards
  (the most recent 15 renders are kept).

The compose file also ships an **optional HTTPS front door** on port **3443**
(the `kantahub-https` service), which makes the origin secure for browsers that
need it:

```
https://<your-server-LAN-IP>:3443/tv
```

It signs its own certificate on first run, so each device warns once — choose
*Advanced → Proceed*. Remove the `kantahub-https` service if you do not want it.

---

## Configuration

`docker-compose.yml` mounts host folders and reads a few environment variables
(see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_URL` | *(auto)* | Absolute URL advertised to the TV/phone, e.g. `http://192.168.1.50:3005`. |
| `KANTAHUB_PORT` | `3005` | Host port (and the container's listening port). |
| `KANTAHUB_TLS_HOST` | `192.168.1.2` | Address signed into the optional HTTPS certificate. |
| `SONGS_DIR` | `/songs` | Song library (bind-mounted). |
| `SOUND_DIR` | `/sound` | SoundFont (bind-mounted). |
| `MEDIA_DIR` | `/media` | Background images/videos (bind-mounted). |
| `MUSIC_DIR` | `/music` | Idle music and score cheer (bind-mounted). |
| `INDEX_DIR` | `/index` | Persisted index and rendered audio (named volume). |
| `PORT` | `3005` | HTTP port inside the container. |

Song, sound, media and music content is **mounted, never baked into the image**.

---

## Troubleshooting

**No sound on the TV.** Press any key on the remote (or tap the screen) once.
Browsers block audio until the page has had an interaction. To remove even that
press, allow sound for the site in the TV browser (Chrome: *Settings → Site
settings → Sound → Allow*, then add `http://<ip>:3005`).

**The lyrics and countdown sit still.** The page could not start audio — press a
key once, or allow sound for the site as above.

**"The server could not prepare the audio for this song."** The server could not
render the file. Check that a SoundFont is present in `sound/`, and that the file
opens in another MIDI player.

**A song takes a few seconds to start.** That is the server-side render on its
first play; it is cached afterwards and pre-rendered while queued.

**The first page load is slow.** The library index is being built (once). Large
libraries take a few minutes; later starts reuse the cache.

**I replaced a song file and the title/lyrics did not change.** Adding or removing
files is picked up automatically, but replacing a file *in place under the same
name* is not — run **Start rescan** on `/admin`.

**The lyrics run early or late.** Nudge them on `/admin` under **TV lyric
timing**: move the slider right if the lyrics run behind the singing. The value is
saved on the server and survives a restart.

**A device cannot reach the server any more.** Its LAN IP changed. Find the new
address with `ipconfig` and use it; the QR code on the TV always follows the
address you opened the TV page with.

---

## Security

Kantahub has **no authentication** and is meant for a **trusted home network**.
Any device on your LAN can control playback, and it serves whatever is inside the
mounted folders. **Do not expose it to the internet** — no port forwarding, no
public reverse proxy — without putting authentication in front of it.

---

## Development

```bash
npm install
npm test            # vitest
npx tsc --noEmit    # typecheck
npm run lint        # eslint
docker compose up -d --build
```

Next.js (App Router) with React 19. `src/lib` holds the pure, unit-tested logic
(scanner, lyrics, room commands, search, …); `src/components` holds the two
screens.

---

## License

_To be decided — add a `LICENSE` file before publishing so others know how they
may use this._

---

## Credits

- In-browser MIDI playback uses [SpessaSynth](https://github.com/spessasynth/spessasynth_lib).
- Server-side rendering uses [FluidSynth](https://www.fluidsynth.org/).
- No songs or SoundFonts are bundled. [GeneralUser GS](https://schristiancollins.com/generaluser.php) is a good free SoundFont.
