/** Synchronous operational persistence; Electron resolves it from SQLite. */
type BusinessBridge = {
  localBusinessGet?: (key: string) => string | null;
  localBusinessSet?: (key: string, value: string | null) => boolean;
};

const bridge = (): BusinessBridge | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { pos?: BusinessBridge }).pos ?? null);

const scoped = (key: string) => `business:${key}`;

export function readBusinessValue(key: string): string | null {
  const pos = bridge();
  if (pos?.localBusinessGet) return pos.localBusinessGet(scoped(key));
  return typeof window === "undefined" ? null : window.localStorage.getItem(key);
}

export function writeBusinessValue(key: string, value: string | null): void {
  const pos = bridge();
  if (pos?.localBusinessSet) {
    if (!pos.localBusinessSet(scoped(key), value)) throw new Error(`SQLite could not persist ${key}`);
    return;
  }
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
}
