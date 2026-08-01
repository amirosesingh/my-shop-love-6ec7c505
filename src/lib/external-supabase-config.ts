/**
 * Connection details for the POS database (the operator's own Supabase
 * project). The publishable key is safe in client code; the service key is
 * never used here.
 */
export const EXTERNAL_SUPABASE_URL =
  (typeof process !== "undefined" ? process.env?.["POS_SUPABASE_URL"] : undefined) ??
  "https://qhrufhtbeguxydenzfey.supabase.co";

export const EXTERNAL_SUPABASE_PUBLISHABLE_KEY =
  (typeof process !== "undefined" ? process.env?.["POS_SUPABASE_PUBLISHABLE_KEY"] : undefined) ??
  "sb_publishable_QwVvttLzDle_xTwP3L7Dyg_A6XM-cC-";