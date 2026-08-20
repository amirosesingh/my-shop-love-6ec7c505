/**
 * Throttled writer for the till's saved state.
 *
 * The register touches state on almost every keystroke, and each touch used to
 * rewrite the whole saved copy. This keeps exactly the same stored shape and
 * key, but writes at most once per idle moment, skips writes that would store
 * the identical text, and always flushes before the page goes away so nothing
 * in flight is lost.
 */

let timer: number | null = null;
let pending: (() => string) | null = null;
let pendingKey = "";
let lastWritten: string | null = null;
let listening = false;

const DELAY_MS = 300;

function write() {
  if (!pending) return;
  const build = pending;
  const key = pendingKey;
  pending = null;
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  try {
    const text = build();
    if (text === lastWritten) return;
    window.localStorage.setItem(key, text);
    lastWritten = text;
  } catch {
    /* storage full or serialisation failed — the till keeps trading */
  }
}

/** Write the newest snapshot now, if one is waiting. */
export function flushPersist() {
  write();
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pagehide", flushPersist);
  window.addEventListener("beforeunload", flushPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersist();
  });
}

/**
 * Queue a save. `build` is only called when the write actually happens, so a
 * burst of changes costs one serialisation instead of one per change.
 */
export function schedulePersist(key: string, build: () => string) {
  if (typeof window === "undefined") return;
  listen();
  pending = build;
  pendingKey = key;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(write, DELAY_MS);
}

/** Test seam: forget what was last written. */
export function resetPersistCache() {
  lastWritten = null;
  pending = null;
  if (timer !== null) {
    if (typeof window !== "undefined") window.clearTimeout(timer);
    timer = null;
  }
}
