/**
 * Health checks that work on a till, not just in an admin's browser.
 *
 * The table list and the relationship check are only handed to a signed-in
 * cloud account. A PIN-signed cashier has none, so those two calls are asked
 * of our own server instead, which proves the device and reads the metadata
 * centrally. Read-only in both directions.
 */
import { readCredentials, authHeaders } from "@/lib/pos-credentials";
import { posFetch } from "@/lib/server-origin";

type Answer = { ok?: boolean; error?: string; tables?: unknown; data?: unknown };

async function ask(action: "shapes" | "relations"): Promise<Answer> {
  try {
    const res = await posFetch("/api/public/health-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action, ...(await readCredentials()) }),
    });
    const body = (await res.json().catch(() => null)) as Answer | null;
    if (!res.ok || !body?.ok)
      return { ok: false, error: body?.error ?? `The server refused the check (${res.status})` };
    return body;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Published table definitions, read through our own server. */
export async function relayTableShapes(): Promise<
  { ok: true; tables: Record<string, { columns: string[]; required: string[] }> } | { ok: false; error: string }
> {
  const body = await ask("shapes");
  if (!body.ok || !body.tables) return { ok: false, error: body.error ?? "No table list returned" };
  return { ok: true, tables: body.tables as Record<string, { columns: string[]; required: string[] }> };
}

/** The relationship & orphan check, read through our own server. */
export async function relayRelationalHealth(): Promise<
  { ok: true; data: unknown } | { ok: false; error: string }
> {
  const body = await ask("relations");
  if (!body.ok) return { ok: false, error: body.error ?? "No answer returned" };
  return { ok: true, data: body.data };
}
