import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({
  username: z.string().min(1).max(64),
  pin: z.string().regex(/^\d{6}$/),
});

/**
 * Mints a signed terminal session for a cashier after the PIN has been
 * verified server-side. Privileged server functions accept this token in
 * place of a Supabase access token.
 */
export const issueCashierSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }) => {
    const { EXTERNAL_SUPABASE_PUBLISHABLE_KEY, EXTERNAL_SUPABASE_URL } = await import(
      "./external-supabase-config"
    );
    const { signCashierSession } = await import("./pos-session.server");
    try {
      const res = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/verify_cashier_pin`, {
        method: "POST",
        headers: {
          apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_username: data.username.trim().toLowerCase(),
          p_pin: data.pin,
        }),
      });
      if (!res.ok) return { ok: false as const, error: "Sign in failed" };
      const rows = (await res.json()) as unknown;
      const row = (Array.isArray(rows) ? rows[0] : rows) as
        | { id?: string; username?: string }
        | null;
      if (!row?.id) return { ok: false as const, error: "Invalid username or PIN" };
      return {
        ok: true as const,
        token: signCashierSession({ id: String(row.id), username: String(row.username ?? "") }),
      };
    } catch {
      return { ok: false as const, error: "Sign in failed" };
    }
  });