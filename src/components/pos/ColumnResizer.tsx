/**
 * Excel-style column resizing for the register.
 *
 * Each handle drags the width of the panel on its right and remembers the
 * result on this device, so a cashier's preferred layout survives restarts.
 */
import { useCallback, useEffect, useState } from "react";

export function usePanelWidth(key: string, initial: number) {
  const [width, setWidth] = useState(initial);

  // Read after mount so the server and first client render match.
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(key));
    if (Number.isFinite(saved) && saved > 0) setWidth(saved);
  }, [key]);

  const set = useCallback(
    (next: number) => {
      setWidth(next);
      try {
        window.localStorage.setItem(key, String(Math.round(next)));
      } catch {
        /* storage blocked — the drag still applies for this session */
      }
    },
    [key],
  );

  return [width, set] as const;
}

/** Vertical drag bar. `direction` says which way widens the tracked panel. */
export function ColumnResizer({
  width,
  onWidth,
  min = 220,
  max = 900,
  direction = "left",
  label = "Resize column",
}: {
  width: number;
  onWidth: (next: number) => void;
  min?: number;
  max?: number;
  /** "left" = dragging left makes the panel wider (handle sits on its left edge) */
  direction?: "left" | "right";
  label?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  function start(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const move = (ev: PointerEvent) => {
      const delta = direction === "left" ? startX - ev.clientX : ev.clientX - startX;
      onWidth(clamp(startWidth + delta));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={start}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onWidth(clamp(width + (direction === "left" ? 16 : -16)));
        if (e.key === "ArrowRight") onWidth(clamp(width + (direction === "left" ? -16 : 16)));
      }}
      className="hidden w-1.5 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-primary/60 focus-visible:bg-primary lg:block"
    />
  );
}
