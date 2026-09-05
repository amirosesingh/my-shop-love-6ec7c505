/**
 * A refused approvals reply must never crash the screens that read it.
 * The server drops empty arrays from the wire, so callers can receive a reply
 * with no `requests` key at all.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: { channel: () => ({ on() {}, subscribe() {} }), removeChannel: () => {} },
}));
vi.mock("../pos-caller-auth", () => ({ getPosCallerAuth: async () => ({}) }));
vi.mock("../held-orders", () => ({ markHeldReady: () => {} }));

const listMock = vi.fn();
vi.mock("../authorization.functions", () => ({
  listAuthorizationRequests: (...a: unknown[]) => listMock(...a),
  claimAuthorizationRequest: vi.fn(),
}));

import { loadApprovalCentre, splitRequests } from "../approval-centre";

describe("approvals resilience", () => {
  it("returns an empty view when the reply carries no requests", async () => {
    listMock.mockResolvedValue({ ok: false, error: "Not signed in" });
    const view = await loadApprovalCentre("s1");
    expect(view.toDecide).toEqual([]);
    expect(view.waiting).toEqual([]);
  });

  it("returns an empty view when ok but the list is missing", async () => {
    listMock.mockResolvedValue({ ok: true, me: { id: "a" } });
    const view = await loadApprovalCentre();
    expect(view.ready).toEqual([]);
  });

  it("splits a normal list without touching missing fields", () => {
    const rows = [
      { id: "1", requestedBy: "bob", status: "pending" },
      { id: "2", requestedBy: "me", status: "pending" },
    ] as never;
    const out = splitRequests(rows, "me");
    expect(out.toDecide).toHaveLength(1);
    expect(out.waiting).toHaveLength(1);
  });
});
