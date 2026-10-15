"use client";

// src/components/Confetti.tsx
// A lightweight confetti burst for the post-song score screen, drawn on a
// canvas. No dependency and no emoji — plain coloured pieces falling with a
// little drift and spin, so it renders the same on a TV browser as on a desktop.
import { useEffect, useRef } from "react";

const COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#4ade80", "#f87171", "#c084fc", "#fde047"];
const MAX_PIECES = 160;
/** Pieces emitted per second while active. */
const EMIT_PER_SEC = 45;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  color: string;
}

export function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width));
      canvas.height = Math.max(1, Math.floor(height));
    };
    resize();
    window.addEventListener("resize", resize);

    const pieces: Piece[] = [];
    const spawn = () => {
      if (pieces.length >= MAX_PIECES) return;
      pieces.push({
        x: Math.random() * width,
        // Start just above the top edge so they drift in.
        y: -20 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 40,
        vy: 70 + Math.random() * 90,
        size: 6 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    };

    let raf = 0;
    let last = performance.now();
    let emitDebt = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      emitDebt += dt * EMIT_PER_SEC;
      while (emitDebt >= 1) {
        emitDebt -= 1;
        spawn();
      }

      ctx.clearRect(0, 0, width, height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.vy += 140 * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        if (p.y - p.size > height) {
          pieces.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, width, height);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="tv-confetti"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 30,
      }}
    />
  );
}

export default Confetti;
