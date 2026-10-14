"use client";

// Bottom transport bar: restart / play-pause / stop / next, plus the karaoke
// voice controls (guide-melody mute, key transpose, tempo, volume). ArrowLeft
// and ArrowRight move between buttons (skipping disabled ones), Enter
// activates the focused button natively; the sliders are native range inputs
// so arrow keys adjust them without extra handling. The currently loaded song
// is displayed above the controls in large TV-readable text.
import { useRef, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import {
  clampTempo,
  clampTranspose,
  clampVolume,
  GUIDE_CHANNEL_DEFAULT,
  TEMPO_DEFAULT,
  TRANSPOSE_DEFAULT,
  TEMPO_MAX,
  TEMPO_MIN,
  VOLUME_DEFAULT,
} from "@/lib/voiceControls";

export interface TransportProps {
  isPlaying: boolean;
  hasSong: boolean;
  hasNext: boolean;
  title: string | null;
  onPrev: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  onNext: () => void;
}

// Karaoke voice controls bound straight to the engine. Engine settings
// (muted channel, key shift, rate, gain) persist across songs, so the UI
// state lives here for the session instead of the per-song store.
function VoiceControls() {
  const { engine } = usePlayer();
  const [guideMuted, setGuideMuted] = useState(false);
  const [transpose, setTranspose] = useState(TRANSPOSE_DEFAULT);
  const [tempo, setTempo] = useState(TEMPO_DEFAULT);
  const [volume, setVolume] = useState(VOLUME_DEFAULT);

  const toggleGuideMute = () => {
    const next = !guideMuted;
    setGuideMuted(next);
    engine?.muteChannel(GUIDE_CHANNEL_DEFAULT, next);
  };

  const shiftTranspose = (delta: number) => {
    const next = clampTranspose(transpose + delta);
    setTranspose(next);
    engine?.setTranspose(next);
  };

  const changeTempo = (rate: number) => {
    const next = clampTempo(rate);
    setTempo(next);
    engine?.setTempo(next);
  };

  const changeVolume = (v: number) => {
    const next = clampVolume(v);
    setVolume(next);
    engine?.setVolume(next);
  };

  const keyButtons = [
    { id: "voice-key-down", label: "♭", aria: "Transpose down one semitone", onClick: () => shiftTranspose(-1) },
    {
      id: "voice-guide",
      label: guideMuted ? "🎤 Guide off" : "🎤 Guide on",
      aria: guideMuted ? "Unmute guide melody channel" : "Mute guide melody channel",
      onClick: toggleGuideMute,
    },
    { id: "voice-key-up", label: "♯", aria: "Transpose up one semitone", onClick: () => shiftTranspose(1) },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Voice controls"
      style={{ display: "flex", alignItems: "center", gap: "1vw" }}
    >
      {keyButtons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          aria-label={btn.aria}
          onClick={btn.onClick}
          style={{
            padding: "0.8vh 1vw",
            fontSize: "1.1vw",
            fontWeight: 700,
            color: "#fafafa",
            background: "#1b2030",
            border: "2px solid #39415a",
            borderRadius: "0.6vw",
            cursor: "pointer",
          }}
        >
          {btn.label}
        </button>
      ))}
      <span aria-live="polite" style={{ fontSize: "1vw", opacity: 0.8, minWidth: "4ch" }}>
        Key {transpose > 0 ? `+${transpose}` : transpose}
      </span>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5vw", fontSize: "1vw" }}>
        Tempo {tempo.toFixed(2)}×
        <input
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          step={0.05}
          value={tempo}
          onChange={(e) => changeTempo(Number(e.target.value))}
          style={{ width: "10vw" }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5vw", fontSize: "1vw" }}>
        Vol {Math.round(volume * 100)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          style={{ width: "10vw" }}
        />
      </label>
    </div>
  );
}

export function Transport({
  isPlaying,
  hasSong,
  hasNext,
  title,
  onPrev,
  onPlayPause,
  onStop,
  onNext,
}: TransportProps) {
  // Fixed action ids serve as React keys: the Play/Pause label and aria
  // change with isPlaying, so keying by either would remount the focused
  // button and drop DOM focus on every toggle.
  const buttons = [
    { id: "restart", label: "⏮ Restart", aria: "Restart song from the beginning", onClick: onPrev, disabled: !hasSong },
    {
      id: "playpause",
      label: isPlaying ? "⏸ Pause" : "▶ Play",
      aria: isPlaying ? "Pause" : "Play",
      onClick: onPlayPause,
      disabled: !isPlaying && !hasSong,
    },
    { id: "stop", label: "⏹ Stop", aria: "Stop", onClick: onStop, disabled: !hasSong },
    { id: "next", label: "⏭ Next", aria: "Play next song in queue", onClick: onNext, disabled: !hasNext },
  ];

  const firstEnabled = buttons.findIndex((b) => !b.disabled);
  const [rawFocusIdx, setFocusIdx] = useState(1);
  // Never keep the roving cursor on a disabled button.
  const focusIdx = buttons[rawFocusIdx] && !buttons[rawFocusIdx].disabled ? rawFocusIdx : firstEnabled;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < buttons.length; i += dir) {
      if (!buttons[i].disabled) {
        setFocusIdx(i);
        refs.current[i]?.focus();
        return;
      }
    }
  };

  return (
    <div
      data-testid="transport"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1vh",
        padding: "1vh 3vw",
      }}
    >
      <p
        aria-live="polite"
        style={{
          fontSize: "1.4vw",
          fontWeight: 600,
          margin: 0,
          opacity: title ? 0.95 : 0.5,
          minHeight: "1.6em",
        }}
      >
        {title ?? "No song loaded"}
      </p>
      <div role="toolbar" aria-label="Playback" style={{ display: "flex", gap: "1vw" }}>
        {buttons.map((btn, i) => (
          <button
            key={btn.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            tabIndex={i === focusIdx ? 0 : -1}
            aria-label={btn.aria}
            disabled={btn.disabled}
            onFocus={() => setFocusIdx(i)}
            onClick={btn.onClick}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            style={{
              padding: "1.2vh 1.6vw",
              fontSize: "1.5vw",
              fontWeight: 700,
              color: btn.disabled ? "#666" : "#fafafa",
              background: btn.disabled ? "#14161f" : "#1b2030",
              border: "2px solid #39415a",
              borderRadius: "0.6vw",
              cursor: btn.disabled ? "default" : "pointer",
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <VoiceControls />
    </div>
  );
}
