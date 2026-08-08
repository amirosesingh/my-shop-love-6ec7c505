// Client for the user's own Supabase project (not the managed backend).
// Publishable keys are safe to ship in client code.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { supabaseConfig } from '@/lib/external-supabase-config';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

// New-format keys are opaque strings, not bearer JWTs — send them as `apikey` only.
const supabaseFetch: typeof fetch = (input, init) => {
  const SUPABASE_PUBLISHABLE_KEY = supabaseConfig().key;
  const requestHeaders =
    typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined;
  const headers = new Headers(requestHeaders);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  if (
    isNewSupabaseApiKey(SUPABASE_PUBLISHABLE_KEY) &&
    headers.get('Authorization') === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
  ) {
    headers.delete('Authorization');
  }
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return fetch(new Request(input, { ...init, headers }));
  }
  return fetch(input, { ...init, headers });
};

function createExternalClient() {
  const { url, key } = supabaseConfig();
  return createClient<Database>(url, key, {
    global: { fetch: supabaseFetch },
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      storageKey: 'sb-external-auth-token',
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createExternalClient> | undefined;

/**
 * Rebuild the client against a different tenant — used the moment a terminal
 * is activated (or unpaired) so no restart is needed.
 */
export function resetExternalClient(): void {
  _client = undefined;
}

/** A throwaway client for a tenant this machine is not registered to yet. */
export function createTenantClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const requestHeaders =
          typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined;
        const headers = new Headers(requestHeaders);
        if (init?.headers) {
          new Headers(init.headers).forEach((value, k) => headers.set(k, value));
        }
        if (isNewSupabaseApiKey(key) && headers.get('Authorization') === `Bearer ${key}`) {
          headers.delete('Authorization');
        }
        headers.set('apikey', key);
        if (typeof Request !== 'undefined' && input instanceof Request) {
          return fetch(new Request(input, { ...init, headers }));
        }
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabaseExternal = new Proxy({} as ReturnType<typeof createExternalClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createExternalClient();
    return Reflect.get(_client, prop, receiver);
  },
});