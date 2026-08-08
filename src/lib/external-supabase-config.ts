/**
 * The single source of truth for which Supabase project this POS talks to.
 *
 * There are no defaults and no fallbacks: if the deployment does not say where
 * the database lives, the app fails loudly instead of quietly connecting
 * somewhere else. The publishable (anon) key is safe in client code; the
 * service key is server-only and lives in `pos-relay.server.ts`.
 */

type Source = { url: string; key: string };

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function fromEnv(bag: Record<string, unknown> | undefined, urlName: string, keyName: string): Source {
  return { url: clean(bag?.[urlName]), key: clean(bag?.[keyName]) };
}

/** Browser build-time values, plus server runtime values where available. */
function bags(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  try {
    if (import.meta.env) out.push(import.meta.env as unknown as Record<string, unknown>);
  } catch {
    /* no import.meta.env in this runtime */
  }
  if (typeof process !== "undefined" && process.env) out.push(process.env as Record<string, unknown>);
  return out;
}

/** Name pairs tried in order; the first pair with BOTH halves present wins. */
const PAIRS: [string, string][] = [
  ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
  ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  ["POS_SUPABASE_URL", "POS_SUPABASE_PUBLISHABLE_KEY"],
  // Rename bridge for older deployments. No values are baked in.
  ["VITE_SUPABASE_EXTERNAL_URL", "VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY"],
  ["SUPABASE_EXTERNAL_URL", "SUPABASE_EXTERNAL_PUBLISHABLE_KEY"],
];

export class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
        "(and the matching SUPABASE_URL / SUPABASE_ANON_KEY for the server) to your " +
        "own Supabase project before starting the app.",
    );
    this.name = "SupabaseConfigError";
  }
}

let cached: Source | undefined;

/** Resolved connection details, or a hard error when nothing is configured. */
export function supabaseConfig(): Source {
  if (cached) return cached;
  for (const bag of bags()) {
    for (const [urlName, keyName] of PAIRS) {
      const found = fromEnv(bag, urlName, keyName);
      if (found.url && found.key) {
        cached = found;
        return cached;
      }
    }
  }
  throw new SupabaseConfigError();
}

/** True when both halves are present — for health checks that must not throw. */
export function hasSupabaseConfig(): boolean {
  try {
    supabaseConfig();
    return true;
  } catch {
    return false;
  }
}

export const EXTERNAL_SUPABASE_URL_NAME = "VITE_SUPABASE_URL";

/**
 * Kept as named exports because call sites read them directly. They are getters
 * on a frozen object so the error surfaces at use, not at import time.
 */
export const externalSupabase = Object.freeze({
  get url() {
    return supabaseConfig().url;
  },
  get key() {
    return supabaseConfig().key;
  },
});
