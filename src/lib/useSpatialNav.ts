"use client";

// src/lib/useSpatialNav.ts
// D-pad / arrow-key navigation for the TV. Browsers do not move focus with the
// arrow keys, and TV remotes only send Up/Down/Left/Right/Enter/Back, so we do
// it ourselves: on an arrow press, focus the geometrically nearest focusable
// element in that direction. Any element with `data-focusable="true"` takes
// part; Enter/Space activate natively (buttons/links), Escape is left to the
// caller's overlay handlers.
import { useEffect } from "react";

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

const VECTORS: Record<Dir, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useSpatialNav(active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = VECTORS[e.key as Dir];
      if (!dir) return;
      const focused = document.activeElement as HTMLElement | null;
      // Let the caret move inside text fields on left/right; up/down escapes.
      if (isEditable(focused) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>('[data-focusable="true"]'),
      ).filter((el) => el.offsetParent !== null && !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (candidates.length === 0) return;

      const from = focused && candidates.includes(focused) ? focused : candidates[0];
      const rect = from.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const el of candidates) {
        if (el === from) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx;
        const dy = r.top + r.height / 2 - cy;
        const inDir = dir[0] !== 0 ? Math.sign(dx) === dir[0] : Math.sign(dy) === dir[1];
        if (!inDir) continue;
        const primary = dir[0] !== 0 ? Math.abs(dx) : Math.abs(dy);
        const secondary = dir[0] !== 0 ? Math.abs(dy) : Math.abs(dx);
        const score = primary + secondary * 2.5;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) {
        e.preventDefault();
        best.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}
