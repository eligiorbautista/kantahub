"use client";

// src/components/NumberPad.tsx
// On-screen numeric keypad: the fastest way to queue a song on a TV remote.
// Large, high-contrast buttons that are all D-pad reachable; a hardware
// keyboard can also type digits / Backspace / Enter.
import { useEffect, useRef } from "react";

export interface NumberPadProps {
  value: string;
  onChange(v: string): void;
  onSubmit(): void;
  /** Optional feedback line ("Song added to queue", "Song not found", …). */
  feedback?: string | null;
}

export function NumberPad({ value, onChange, onSubmit, feedback }: NumberPadProps) {
  const padRef = useRef<HTMLDivElement>(null);

  // Type digits from a real keyboard without stealing focus from the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        onChange((value + e.key).slice(0, 7));
      } else if (e.key === "Backspace") {
        onChange(value.slice(0, -1));
      } else if (e.key === "Enter") {
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onSubmit]);

  const press = (d: string) => onChange((value + d).slice(0, 7));

  const keys: Array<{ label: string; action: () => void; aria: string }> = [
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => ({
      label: d,
      action: () => press(d),
      aria: d,
    })),
    { label: "Clear", action: () => onChange(""), aria: "Clear" },
    { label: "0", action: () => press("0"), aria: "0" },
    { label: "⌫", action: () => onChange(value.slice(0, -1)), aria: "Backspace" },
  ];

  return (
    <div ref={padRef} style={{ display: "flex", flexDirection: "column", gap: "2vh", alignItems: "center" }}>
      <div
        aria-label="Song number"
        style={{
          fontSize: "6vh",
          fontWeight: 800,
          letterSpacing: "0.1em",
          minWidth: "12ch",
          textAlign: "center",
          borderBottom: "0.4vh solid rgba(255,255,255,0.35)",
          padding: "0.4vh 1ch",
          color: value ? "#fff" : "rgba(255,255,255,0.35)",
        }}
      >
        {value || "0000"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1.4vh",
          width: "min(52vh, 70vw)",
        }}
      >
        {keys.map((k) => (
          <button
            key={k.aria}
            type="button"
            data-focusable="true"
            aria-label={k.aria}
            onClick={k.action}
            style={{
              fontSize: "4.4vh",
              fontWeight: 700,
              padding: "1.6vh 0",
              borderRadius: "1.2vh",
              border: "0.2vh solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {k.label}
          </button>
        ))}
        <button
          type="button"
          data-focusable="true"
          onClick={onSubmit}
          style={{
            gridColumn: "1 / -1",
            fontSize: "3.4vh",
            fontWeight: 800,
            padding: "1.6vh 0",
            borderRadius: "1.2vh",
            border: "none",
            background: "#3b82f6",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          OK — Add to queue
        </button>
      </div>
      {feedback && (
        <p role="status" style={{ fontSize: "2.6vh", margin: 0, opacity: 0.9 }}>
          {feedback}
        </p>
      )}
    </div>
  );
}

export default NumberPad;
