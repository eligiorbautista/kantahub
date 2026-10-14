// tests/settings.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSettings, resetSettingsCache, saveSettings } from "@/lib/settings";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "kantahub-settings-"));
  process.env.INDEX_DIR = tmp;
  resetSettingsCache();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("host settings", () => {
  it("defaults the lyric offset to 0", async () => {
    expect((await loadSettings()).lyricOffsetSec).toBe(0);
  });

  it("persists and reloads the lyric offset", async () => {
    await saveSettings({ lyricOffsetSec: 0.4 });
    resetSettingsCache();
    expect((await loadSettings()).lyricOffsetSec).toBe(0.4);
  });

  it("clamps an out-of-range stored value on load", async () => {
    await saveSettings({ lyricOffsetSec: 99 });
    resetSettingsCache();
    expect((await loadSettings()).lyricOffsetSec).toBe(5);
  });
});
