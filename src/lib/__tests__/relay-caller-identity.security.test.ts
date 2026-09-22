import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pos-session.server", () => ({
  verifyCashierSession: (token: string) =>
    token === "verified-person" ? { id: "person-id", username: "shop-admin" } : null,
}));

import { verifyRelayCaller } from "@/core/api/pos-relay.server";

describe("relay caller identity", () => {
  it("keeps the verified PIN user when a terminal Auth token is also present", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const caller = await verifyRelayCaller({
        cashierToken: "verified-person",
        accessToken: "terminal-machine-account",
      });
      expect(caller).toMatchObject({ kind: "cashier", staffUserId: "shop-admin" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
