/**
 * Idle auto-lock for the till.
 *
 * After a set number of seconds with no touch, tap or key, the screen returns
 * to the sign-in keypad. The shift stays open — only the person is signed out.
 * The delay is set per machine in Settings and is measured in seconds so a
 * busy counter can be locked down very tightly.
 */
import { useEffect, useRef } from "react";

const KEY = "pos.autoLock.seconds";
export const DEFAULT_AUTO_LOCK_SECONDS = 180;

const listeners = new Set<() => void>();

/** Seconds of inactivity before locking. 0 means the screen never locks. */
export function autoLockSeconds(): number {
  if (typeof window === "undefined") return DEFAULT_AUTO_LOCK_SECONDS;
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return DEFAULT_AUTO_LOCK_SECONDS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 86_400) : DEFAULT_AUTO_LOCK_SECONDS;
}

export function setAutoLockSeconds(seconds: number) {
  if (typeof window === "undefined") return;
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.round(seconds), 86_400) : 0;
  window.localStorage.setItem(KEY, String(safe));
  for (const l of listeners) l();
}

export function subscribeAutoLock(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

/**
 * Lock `onLock` in when the screen has been left alone. Nothing happens while
 * nobody is signed in, or while the delay is switched off.
 */
export function useAutoLock(active: boolean, onLock: () => void) {
  const lockRef = useRef(onLock);
  lockRef.current = onLock;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let timer = 0;
    let stopped = false;

    const arm = () => {
      window.clearTimeout(timer);
      const seconds = autoLockSeconds();
      if (!seconds || stopped) return;
      timer = window.setTimeout(() => {
        stopped = true;
        lockRef.current();
      }, seconds * 1000);
    };

    for (const e of EVENTS) window.addEventListener(e, arm, { passive: true });
    const offSetting = subscribeAutoLock(arm);
    arm();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      for (const e of EVENTS) window.removeEventListener(e, arm);
      offSetting();
    };
  }, [active]);
}