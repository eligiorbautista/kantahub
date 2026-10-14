// src/lib/settings.ts
// Small persisted host settings — currently just the TV lyric-sync offset, so a
// value the host tuned by ear survives a container restart. Stored as JSON next
// to the library index.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface HostSettings {
  /** Seconds added to the lyric clock: positive shows the highlight earlier. */
  lyricOffsetSec: number;
}

function settingsFile(): string {
  const dir = process.env.INDEX_DIR ?? path.join(os.tmpdir(), "kantahub-index");
  return path.join(dir, "settings.json");
}

let cache: HostSettings | null = null;

export async function loadSettings(): Promise<HostSettings> {
  if (cache) return cache;
  try {
    const raw: unknown = JSON.parse(await fs.readFile(settingsFile(), "utf8"));
    const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<HostSettings>;
    cache = {
      lyricOffsetSec:
        typeof obj.lyricOffsetSec === "number" && Number.isFinite(obj.lyricOffsetSec)
          ? Math.max(-5, Math.min(5, obj.lyricOffsetSec))
          : 0,
    };
  } catch {
    cache = { lyricOffsetSec: 0 };
  }
  return cache;
}

export async function saveSettings(patch: Partial<HostSettings>): Promise<HostSettings> {
  const next = { ...(await loadSettings()), ...patch };
  cache = next;
  try {
    await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
    await fs.writeFile(settingsFile(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    // Persistence is best-effort; the in-memory value still applies this run.
  }
  return next;
}

/** Test-only: drop the in-memory cache. */
export function resetSettingsCache(): void {
  cache = null;
}
