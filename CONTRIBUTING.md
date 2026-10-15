# Contributing to Kantahub

Thanks for taking a look. Kantahub is a small, self-hosted app, so the process is
deliberately light.

## Getting set up

You need Node.js 24 (or newer) and, for a full run, Docker.

```bash
npm install
npm test            # vitest
npx tsc --noEmit    # typecheck
npm run lint        # eslint
```

To run the whole thing the way users do:

```bash
docker compose up -d --build
```

The `songs/`, `sound/`, `media/` and `music/` folders are **git-ignored** — put
your own content there, and never commit it. A single MIDI/KAR file plus any
SoundFont is enough to try playback.

## What to keep in mind

- **`src/lib` is pure logic** (scanner, lyrics, room commands, search, media and
  music listings, …). It must stay free of browser- and framework-specific
  imports so it can be unit-tested under Node. Put new logic here when you can.
- **`src/components` holds the two screens** — the TV display (which owns the
  audio) and the controller (which only sends commands).
- **Add a test** for behaviour you change. `npm test` must stay green, and so must
  `npx tsc --noEmit` and `npm run lint`.
- **Small, focused changes** are much easier to review than large ones. Keep
  unrelated refactors out of a fix.
- **No emoji in the UI**, and no new dependencies unless there is a clear reason
  (see `package.json` — the runtime footprint is deliberately tiny).

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `docs:`, `chore:`, `perf:`, `test:`, `refactor:`.
- Describe *why* in the body when it is not obvious.
- In a pull request, say what changed, how you tested it, and mention anything
  you could not verify (a specific TV browser, for example).

## Reporting a bug

Please include:

- what you did, what you expected, and what happened instead;
- the screen involved (`/tv`, `/`, `/admin`) and the device/browser;
- any console errors from the browser;
- the relevant container logs: `docker compose logs --tail 100`.

Issues about a specific song are much easier to act on with the file name (for
example `00123 - Title - Artist.mid`) and what the TV showed.

## Scope

Kantahub is meant to be a small, dependable karaoke player for one home network.
Ideas that fit: playback and lyric accuracy, TV/remote usability, resilience on
weak hardware, and clearer setup. Ideas that do not fit well: accounts,
multi-tenant hosting, cloud services, or anything that requires sending your
library off your LAN.
