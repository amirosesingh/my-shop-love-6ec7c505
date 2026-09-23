import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/external-client", () => ({ supabaseExternal: { rpc } }));
import { applyStockDeltaBatch } from "../stock-recovery";
const movement = { movementId: "movement-1", productId: "product-1", storeId: "branch-1", delta: 2 };
beforeEach(() => { rpc.mockReset(); });
describe("stock confirmation", () => {
  it("accepts an idempotent duplicate confirmation", async () => {
    rpc.mockResolvedValue({ data: [{ movement_id: movement.movementId, status: "duplicate" }], error: null });
    expect((await applyStockDeltaBatch([movement, movement])).length).toBe(1);
  });
  it("rejects a same-length answer for the wrong movement", async () => {
    rpc.mockResolvedValue({ data: [{ movement_id: "different", status: "applied" }], error: null });
    await expect(applyStockDeltaBatch([movement])).rejects.toThrow("did not confirm");
  });
  it("rejects conflicting duplicate IDs before sending stock", async () => {
    await expect(applyStockDeltaBatch([movement, { ...movement, delta: 3 }])).rejects.toThrow("Conflicting");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("propagates transport failures", async () => {
    rpc.mockRejectedValue(new Error("offline"));
    await expect(applyStockDeltaBatch([movement])).rejects.toThrow("offline");
  });
});
