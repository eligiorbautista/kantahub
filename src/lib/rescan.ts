// src/lib/rescan.ts
// Library rescan/migration: re-parse every entry with the current parser and
// report which titles/artists/numbers changed. Runs in the background (a ~48k
// file re-parse takes minutes) and never deletes files — only the cached index
// is rebuilt, original paths are kept.
import { defaultSongsDir, getSongsIndex, invalidateSongsIndex } from "@/lib/songIndex";
import type { SongMeta } from "@/lib/scanner";

export interface RescanMeta {
  title: string;
  artist: string;
  number?: string;
}

export interface RescanChange {
  id: string;
  fileName: string;
  /** null when the song is newly discovered. */
  from: RescanMeta | null;
  to: RescanMeta;
}

export interface RescanStatus {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  total: number;
  changed: number;
  /** First 100 changes, for a preview report. */
  sample: RescanChange[];
  error?: string;
}

let status: RescanStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  changed: 0,
  sample: [],
};

function pick(s: SongMeta): RescanMeta {
  return { title: s.title, artist: s.artist, number: s.number };
}

export function getRescanStatus(): RescanStatus {
  return status;
}

/** Kick off a background rescan. No-op when one is already running. */
export function startRescan(): RescanStatus {
  if (status.running) return status;
  status = { running: true, startedAt: Date.now(), finishedAt: null, total: 0, changed: 0, sample: [] };
  void (async () => {
    try {
      const dir = defaultSongsDir();
      const before = await getSongsIndex(dir);
      const beforeById = new Map(before.map((s) => [s.id, s]));
      invalidateSongsIndex(dir);
      const after = await getSongsIndex(dir, { force: true });
      const changes: RescanChange[] = [];
      for (const s of after) {
        const b = beforeById.get(s.id);
        if (!b) {
          changes.push({ id: s.id, fileName: s.fileName, from: null, to: pick(s) });
        } else if (b.title !== s.title || b.artist !== s.artist || b.number !== s.number) {
          changes.push({ id: s.id, fileName: s.fileName, from: pick(b), to: pick(s) });
        }
      }
      status = {
        running: false,
        startedAt: status.startedAt,
        finishedAt: Date.now(),
        total: after.length,
        changed: changes.length,
        sample: changes.slice(0, 100),
      };
    } catch (err) {
      status = { ...status, running: false, finishedAt: Date.now(), error: String(err) };
    }
  })();
  return status;
}
