/**
 * Puts a transparent stand-in in front of a desktop bridge.
 *
 * The desktop shell hands its bridges to the page read-only, so their functions
 * can never be replaced in place — attempting it throws
 * "Cannot assign to read only property ...". The stand-in forwards every call
 * untouched and only adds the administrator prompt when a call comes back
 * refused.
 */

export type Refusal = { ok?: boolean; code?: string; error?: string };

export const isRefusal = (value: unknown): value is Refusal =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as Refusal).ok === false &&
  (value as Refusal).code === "EPRIVILEGE";

/** Calls that must never trigger the prompt: event subscriptions and unlock. */
const passthrough = (key: string) => key.startsWith("on") || key === "unlock";

export function wrapBridge<T extends object>(
  bridge: T,
  requestUnlock: (message: string) => Promise<boolean>,
): T {
  const cache = new Map<string, unknown>();
  return new Proxy(bridge, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || typeof value !== "function") return value;
      if (passthrough(prop)) return value;
      const cached = cache.get(prop);
      if (cached) return cached;
      const original = (value as (...args: unknown[]) => unknown).bind(target);
      const wrapped = async (...args: unknown[]) => {
        const first = await original(...args);
        if (!isRefusal(first)) return first;
        const unlocked = await requestUnlock(first.error ?? "");
        if (!unlocked) return first;
        return original(...args);
      };
      cache.set(prop, wrapped);
      return wrapped;
    },
    // The underlying bridge is read-only; swallow writes instead of throwing.
    set() {
      return true;
    },
  });
}
