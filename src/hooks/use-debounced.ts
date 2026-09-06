import { useEffect, useState } from "react";

/**
 * Holds back a fast-changing value — a search box, mostly — so the expensive
 * work behind it runs once the operator stops typing instead of on every key.
 */
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return settled;
}
