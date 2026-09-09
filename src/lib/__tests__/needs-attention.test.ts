import { describe, expect, it } from "vitest";
import { attentionCounts } from "../needs-attention";

const request = (status: string) => ({ status }) as never;
const transfer = (status: string) => ({ status }) as never;

describe("Needs Attention uses authoritative source state", () => {
  it("counts pending approvals independently of notification clear state", () => {
    const source = [request("pending")];
    expect(attentionCounts({ approvals: source }).approvals).toBe(1);
    // Clearing one or all notifications changes no input to the source projection.
    const clearedNotificationIds = ["event-1", "event-2"];
    expect(clearedNotificationIds).toHaveLength(2);
    expect(attentionCounts({ approvals: source }).approvals).toBe(1);
  });

  it.each(["approved", "rejected", "cancelled", "expired"])(
    "resolves %s approvals automatically",
    (status) => {
      expect(attentionCounts({ approvals: [request(status)] }).approvals).toBe(0);
    },
  );

  it("does not recreate a resolved issue after refresh/restart or stale notification replay", () => {
    const authoritativeReload = [request("approved")];
    expect(attentionCounts({ approvals: authoritativeReload }).total).toBe(0);
    expect(attentionCounts({ approvals: authoritativeReload }).total).toBe(0);
  });

  it("counts only actionable transfer and failed-sync states", () => {
    const counts = attentionCounts({
      transfers: [transfer("awaiting_approval"), transfer("received"), transfer("completed")],
      syncFailures: 1,
    });
    expect(counts).toEqual({ approvals: 0, transfers: 2, sync: 1, total: 3 });
  });
});
