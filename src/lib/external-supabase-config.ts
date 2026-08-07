/**
 * Connection details for the POS database (the operator's own Supabase
 * project). The publishable key is safe in client code; the service key is
 * never used here.
 */
const env = (name: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[name] : undefined;

export const EXTERNAL_SUPABASE_URL =
  env("POS_SUPABASE_URL") ??
  env("VITE_SUPABASE_EXTERNAL_URL") ??
  "https://qhrufhtbeguxydenzfey.supabase.co";

export const EXTERNAL_SUPABASE_PUBLISHABLE_KEY =
  env("POS_SUPABASE_PUBLISHABLE_KEY") ??
  env("VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY") ??
  "sb_publishable_QwVvttLzDle_xTwP3L7Dyg_A6XM-cC-";