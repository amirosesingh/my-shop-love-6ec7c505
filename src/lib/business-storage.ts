/** Browser compatibility storage. Electron never persists business state here. */
const isElectronRenderer = () =>
  typeof window !== "undefined" && !!(window as unknown as { pos?: unknown }).pos;

export function readBusinessValue(key: string): string | null {
  if (isElectronRenderer()) return null;
  return typeof window === "undefined" ? null : window.localStorage.getItem(key);
}

export function writeBusinessValue(key: string, value: string | null): void {
  if (isElectronRenderer()) return;
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
}
