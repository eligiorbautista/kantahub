"use client";

// Background layer for the lyric stage: cycles the images on the /media
// volume as a slow slideshow, or plays the first video there as a
// looping muted BGV (video wins when both exist — a chosen BGV beats
// stills). Renders absolutely nothing while the volume is missing, empty,
// or the listing request fails, and never intercepts pointer events from
// the UI above it.
import { useEffect, useRef, useState } from "react";
import { pickNextIndex, type MediaList } from "@/lib/media";

export interface BackgroundMediaProps {
  // Milliseconds each slideshow image stays up before advancing.
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 15_000;

// Streams one file from the /media volume; names come from the listing.
function mediaFileUrl(fileName: string): string {
  return `/api/media?file=${encodeURIComponent(fileName)}`;
}

export function BackgroundMedia({ intervalMs = DEFAULT_INTERVAL_MS }: BackgroundMediaProps = {}) {
  const [media, setMedia] = useState<MediaList | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  // The slideshow is a pure function of wall-clock time since the list
  // loaded: after a paused TV (or tab) resumes, the index recomputes
  // correctly instead of drifting with missed timers.
  const startRef = useRef(0);
  const indexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/media");
        if (!res.ok) return;
        const data = (await res.json()) as Partial<MediaList>;
        if (!cancelled) {
          startRef.current = Date.now();
          setMedia({ images: data.images ?? [], videos: data.videos ?? [] });
        }
      } catch {
        // Missing volume or request failure: no background, no error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const images = media?.images ?? [];
  const video = media?.videos[0];

  useEffect(() => {
    // One still image (or the BGV video) needs no rotation.
    if (video !== undefined || images.length < 2) return;
    const tick = () => {
      const next = pickNextIndex(indexRef.current, images.length, Date.now() - startRef.current, intervalMs);
      if (next !== indexRef.current) {
        indexRef.current = next;
        setImageIndex(next);
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [video, images.length, intervalMs]);

  if (!media || (images.length === 0 && video === undefined)) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="background-media"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        overflow: "hidden",
        // Purely decorative: the background must never eat clicks, focus,
        // or D-pad navigation meant for the lyrics above it. The dark tint
        // keeps the lyric text legible over bright images.
        background: "rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      {video !== undefined ? (
        <video
          src={mediaFileUrl(video)}
          muted
          loop
          playsInline
          autoPlay
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- runtime-listed user files; server-side image optimization would only burn CPU on this LAN-only app
        <img
          key={images[imageIndex]}
          src={mediaFileUrl(images[imageIndex])}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </div>
  );
}

export default BackgroundMedia;
