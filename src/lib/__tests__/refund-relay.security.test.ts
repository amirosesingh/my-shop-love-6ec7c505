/**
 * A refund never carries a stock figure from the till.
 *
 * The till may only name the bill and a stable id for the refund. The server
 * proves the caller's branch and permission, then the database works out how
 * much may still be returned. These tests hold that boundary in place.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
vi.mock("@/lib/external-supabase-config", () => ({
  supabaseConfig: () => ({ url: "https://example.test", key: "k" }),
  runtimeEnvValue: () => "service-key",
}));

import { runRelayRpc } from "@/core/api/pos-relay.server";
import type { RelayScope } from "@/core/api/relay-policy.server";

const cashier: RelayScope = {
  kind: "cashier",
  label: "till1",
  storeId: "STORE-A",
  role: "staff",
  roleSlug: "cashier",
  permissions: { can_process_refund: true },
  isSupervisor: false,
  staffUserId: "u-1",
  actorName: "Amy",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => fetchMock.mockReset());

describe("refunds through the server relay", () => {
  it("refuses a routine that is not on the allow-list", async () => {
    const out = await runRelayRpc(
      { kind: "rpc", table: "sales", fn: "stock_apply_delta", args: {} },
      cashier,
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("TABLE_FORBIDDEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a caller without the refund permission", async () => {
    const out = await runRelayRpc(
      { kind: "rpc", table: "sales", fn: "sale_refund", args: { _sale_id: "s-1" } },
      { ...cashier, permissions: {} },
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("PERMISSION_DENIED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a bill that belongs to another branch", async () => {
    fetchMock.mockResolvedValueOnce(json([{ store_id: "STORE-B" }]));
    const out = await runRelayRpc(
      { kind: "rpc", table: "sales", fn: "sale_refund", args: { _sale_id: "s-1" } },
      cashier,
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("STORE_FORBIDDEN");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runs the routine for the caller's own branch and passes no stock figures", async () => {
    fetchMock.mockResolvedValueOnce(json([{ store_id: "STORE-A" }])).mockResolvedValueOnce(json({}));
    const out = await runRelayRpc(
      {
        kind: "rpc",
        table: "sales",
        fn: "sale_refund",
        args: { _sale_id: "s-1", _client_refund_id: "refund:s-1", _lines: null },
      },
      cashier,
    );
    expect(out.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/rest/v1/rpc/sale_refund");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["_client_refund_id", "_lines", "_sale_id"]);
  });
});
