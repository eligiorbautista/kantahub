"use client";

// src/components/CountdownScreen.tsx
// The "get ready" screen shown before a song starts. The seconds come from the
// server-authoritative deadline (see remoteStore.countdownEndsAt), so every
// device in the room shows the same number.
import { songLabel } from "@/lib/songsClient";

export interface CountdownScreenProps {
  secondsLeft: number;
  singer: string;
  title: string;
  artist: string;
}

export function CountdownScreen({ secondsLeft, singer, title, artist }: CountdownScreenProps) {
  return (
    <div
      data-testid="countdown-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2.4vh",
        textAlign: "center",
        color: "#fff",
        textShadow: "0 0.4vh 2vh rgba(0,0,0,0.9)",
      }}
    >
      {singer && (
        <p style={{ fontSize: "4vh", fontWeight: 700, margin: 0, opacity: 0.9 }}>
          Get ready, {singer}!
        </p>
      )}
      <p style={{ fontSize: "3.4vh", fontWeight: 600, margin: 0, opacity: 0.85 }}>
        {songLabel({ title, artist })}
      </p>
      <p
        aria-live="polite"
        style={{ fontSize: "22vh", fontWeight: 900, lineHeight: 1, margin: 0, color: "#fbbf24" }}
      >
        {secondsLeft}
      </p>
      <p style={{ fontSize: "3vh", fontWeight: 600, margin: 0, opacity: 0.8 }}>
        Starting in {secondsLeft}…
      </p>
    </div>
  );
}

export default CountdownScreen;
