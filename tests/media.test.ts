// tests/media.test.ts
import { describe, it, expect } from "vitest";
import { listMedia, mediaContentType, pickNextIndex } from "@/lib/media";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("pickNextIndex", () => {
  it("advances after the interval and wraps", () => {
    expect(pickNextIndex(0, 3, 1000, 5000)).toBe(0);
    expect(pickNextIndex(0, 3, 6000, 5000)).toBe(1);
    expect(pickNextIndex(2, 3, 6000, 5000)).toBe(0);
  });
  it("is a no-op with zero items", () => {
    expect(pickNextIndex(0, 0, 6000, 5000)).toBe(0);
  });
  it("advances by whole elapsed intervals", () => {
    expect(pickNextIndex(0, 3, 12000, 5000)).toBe(2);
  });
  it("keeps the current index before the interval or on a bad interval", () => {
    expect(pickNextIndex(1, 3, 4999, 5000)).toBe(1);
    expect(pickNextIndex(1, 3, 9999, 0)).toBe(1);
  });
});

describe("listMedia", () => {
  it("splits images and videos by extension, case-insensitively", async () => {
    const media = await listMedia(path.join(fixtures, "media"));
    expect(media.images).toEqual(["aurora.jpg", "beach.JPEG", "city.gif", "forest.png", "nebula.WEBP"]);
    expect(media.videos).toEqual(["bgv.mp4", "bgv2.WebM"]);
  });
  it("returns empty lists for a missing directory", async () => {
    expect(await listMedia(path.join(fixtures, "does-not-exist"))).toEqual({ images: [], videos: [] });
  });
  it("returns empty lists for an empty directory", async () => {
    expect(await listMedia(path.join(fixtures, "empty-media"))).toEqual({ images: [], videos: [] });
  });
});

describe("mediaContentType", () => {
  it("maps media extensions to MIME types", () => {
    expect(mediaContentType("a.jpg")).toBe("image/jpeg");
    expect(mediaContentType("a.JPEG")).toBe("image/jpeg");
    expect(mediaContentType("photo.png")).toBe("image/png");
    expect(mediaContentType("shot.webp")).toBe("image/webp");
    expect(mediaContentType("anim.gif")).toBe("image/gif");
    expect(mediaContentType("bgv.mp4")).toBe("video/mp4");
    expect(mediaContentType("bgv2.WebM")).toBe("video/webm");
  });
  it("falls back to a generic binary type", () => {
    expect(mediaContentType("notes.txt")).toBe("application/octet-stream");
  });
});
