"use client";

// Background layer for the TV stage: plays the first video on the /media
// volume as a looping muted BGV (a chosen BGV beats stills), or cycles the
// images there as a slow slideshow. Renders absolutely nothing while the
// volume is missing, empty, or the listing request fails, and never
// intercepts pointer events from the UI above it.
//
// Autoplay is best-effort and robust: muted videos are allowed to autoplay, but
// some TV browsers still require an explicit play() and will reject it until
// the first user gesture. We therefore retry on load events, on a few early
// timers, whenever the page becomes visible again, and on the first
// remote/keyboard/pointer interaction.
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
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Robust muted autoplay for the BGV video.
  useEffect(() => {
    if (video === undefined) return;
    const v = videoRef.current;
    if (!v) return;
    // Belt and braces: some engines only honour the *attribute* for autoplay.
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");

    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    tryPlay();

    const loadEvents = ["loadedmetadata", "loadeddata", "canplay", "canplaythrough"];
    for (const ev of loadEvents) v.addEventListener(ev, tryPlay);

    const onVisible = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onGesture = () => tryPlay();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    window.addEventListener("touchstart", onGesture);

    // A slow first byte over the LAN can reject the very first play(); retry.
    const timers = [500, 1500, 3000, 6000].map((ms) => window.setTimeout(tryPlay, ms));

    return () => {
      for (const ev of loadEvents) v.removeEventListener(ev, tryPlay);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [video]);

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
        // or D-pad navigation meant for the lyrics above it.
        background: "#000",
        pointerEvents: "none",
      }}
    >
      {video !== undefined ? (
        <video
          ref={videoRef}
          src={mediaFileUrl(video)}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
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
