import { describe, expect, it, vi } from "vitest";

describe("Electron sales visibility", () => {
  it("hydrates local receipt headers with their items and payments", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("DECLARE @recent_sales");
      expect(sql).toContain("dbo.sale_items");
      expect(sql).toContain("dbo.payment_transactions");
      return {
        recordsets: [
          [{ id: "11111111-1111-4111-8111-111111111111", payments: "[]" }],
          [
            {
              id: "22222222-2222-4222-8222-222222222222",
              sale_id: "11111111-1111-4111-8111-111111111111",
              product_name: "Racket",
            },
          ],
          [
            {
              id: "33333333-3333-4333-8333-333333333333",
              sale_id: "11111111-1111-4111-8111-111111111111",
              source_type: "sale",
              method: "card",
              amount: 25,
              metadata: '{"bank":"BIBD"}',
            },
          ],
        ],
      };
    });
    const request = { input: vi.fn(() => request), query };
    const manager = { pool: { request: () => request } };
    const registry = {
      tables: ["sales", "sale_items", "payment_transactions"].map((sqlServerTable) => ({
        sqlServerTable,
        columns: [],
      })),
    };
    const { OperationsRepository } =
      await import("../../../electron/db/repositories/operations.cjs");
    const repository = new OperationsRepository(manager, registry);

    const result = await repository.snapshot("branch-1");
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].sale_items).toHaveLength(1);
    expect(result.sales[0].payments).toEqual([
      expect.objectContaining({ method: "card", amount: 25, bankName: "BIBD" }),
    ]);
  });

  it("wires durable commit notifications through main and preload", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync("electron/main.cjs", "utf8");
    const preload = readFileSync("electron/preload.cjs", "utf8");
    const store = readFileSync("src/lib/pos-store.tsx", "utf8");
    expect(main).toContain('webContents.send("business:changed",change)');
    expect(main).toContain("publishBusinessChange({kind:aggregate.kind");
    expect(preload).toContain('ipcRenderer.on("business:changed", handler)');
    expect(store).toContain("bridge.onBusinessChanged");
    expect(store).toContain("loadLocalSales()");
  });
});
