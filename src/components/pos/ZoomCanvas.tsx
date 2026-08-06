/**
 * Fit-to-screen zoom surface for the register.
 *
 * The till is laid out fluidly, so instead of clipping the content we give it
 * an inverse size (100 / scale %) and scale it back down with a GPU transform.
 * At the fit scale the whole till is visible on a 1024x768 panel; zooming in
 * simply lays the same UI out in a smaller virtual viewport and magnifies it.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** Layout the till is designed around; smaller windows scale down to fit. */
const REF_WIDTH = 1280;
const REF_HEIGHT = 760;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function fitFor(width: number, height: number) {
  if (!width || !height) return 1;
  const fit = Math.min(width / REF_WIDTH, height / REF_HEIGHT, 1);
  return Number(clamp(fit, MIN_ZOOM, MAX_ZOOM).toFixed(3));
}

export function ZoomCanvas({ children, className }: { children: ReactNode; className?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [scale, setScale] = useState(1);
  const [smooth, setSmooth] = useState(false);
  const adjusted = useRef(false);
  const scaleRef = useRef(1);
  scaleRef.current = scale;

  // Re-fit whenever the available space changes, until the user takes over.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const next = fitFor(el.clientWidth, el.clientHeight);
      setFit(next);
      if (!adjusted.current) setScale(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyScale = useCallback((next: number, animate: boolean) => {
    adjusted.current = true;
    setSmooth(animate);
    setScale(Number(clamp(next, MIN_ZOOM, MAX_ZOOM).toFixed(3)));
  }, []);

  const step = (factor: number) => applyScale(scaleRef.current * factor, true);
  const reset = () => {
    adjusted.current = false;
    setSmooth(true);
    setScale(fit);
  };

  // Ctrl/Cmd + wheel and trackpad pinch (which arrives as a ctrlKey wheel).
  // React's onWheel is passive, so the listener has to be attached natively.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      applyScale(scaleRef.current * Math.exp(-dy * 0.0015), false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyScale]);

  // Two-finger pinch on touch screens.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const points = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let startScale = 1;

    const dist = () => {
      const [a, b] = [...points.values()];
      if (!a || !b) return 0;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) {
        startDist = dist();
        startScale = scaleRef.current;
      }
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size !== 2 || !startDist) return;
      e.preventDefault();
      applyScale(startScale * (dist() / startDist), false);
    };
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (points.size < 2) startDist = 0;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", up);
    };
  }, [applyScale]);

  const pct = Math.round(scale * 100);
  const inverse = `${(100 / scale).toFixed(4)}%`;

  return (
    <div
      ref={viewportRef}
      className={`relative h-full min-h-0 w-full min-w-0 overflow-auto ${className ?? ""}`}
    >
      <div
        style={{
          width: inverse,
          height: inverse,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          transition: smooth ? "transform 150ms ease-out" : undefined,
          willChange: "transform",
        }}
      >
        {children}
      </div>

      <div className="pointer-events-auto absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-full border border-border bg-card/95 px-1 py-1 shadow-lg backdrop-blur">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="pos-icon-btn size-8 rounded-full"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={scale <= MIN_ZOOM + 0.001}
          onClick={() => step(1 / 1.1)}
        >
          <Minus className="size-4" />
        </Button>
        <span className="numeric min-w-12 text-center text-xs tabular-nums" aria-live="polite">
          {pct}%
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="pos-icon-btn size-8 rounded-full"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={scale >= MAX_ZOOM - 0.001}
          onClick={() => step(1.1)}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="pos-icon-btn size-8 rounded-full"
          aria-label="Fit to screen"
          title="Fit to screen"
          onClick={reset}
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}