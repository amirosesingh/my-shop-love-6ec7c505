/**
 * Builds a stand-in copy of a desktop bridge.
 *
 * The desktop shell hands its bridges to the page read-only, so their functions
 * can never be replaced in place — attempting it threw
 * "Cannot assign to read only property 'write'" and blanked the whole till.
 * (A Proxy cannot help either: a frozen target forces the get trap to return
 * the original function.) So we build a fresh plain object whose functions
 * forward every call to the real bridge and only add the administrator prompt
 * when a call comes back refused.
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
  const copy: Record<string, unknown> = {};

  const keys = new Set<string>();
  for (const key of Object.getOwnPropertyNames(bridge)) keys.add(key);
  const proto = Object.getPrototypeOf(bridge) as object | null;
  if (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== "constructor") keys.add(key);
    }
  }

  for (const key of keys) {
    let value: unknown;
    try {
      value = (bridge as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    if (typeof value !== "function" || passthrough(key)) {
      copy[key] = value;
      continue;
    }
    const original = (value as (...args: unknown[]) => unknown).bind(bridge);
    copy[key] = async (...args: unknown[]) => {
      const first = await original(...args);
      if (!isRefusal(first)) return first;
      const unlocked = await requestUnlock(first.error ?? "");
      if (!unlocked) return first;
      return original(...args);
    };
  }

  return copy as T;
}
