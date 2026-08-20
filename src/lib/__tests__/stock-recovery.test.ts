import { beforeEach, describe, expect, it } from "vitest";

// The library only touches storage when a window exists; give it a small one.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
};
import {
  clearUnappliedStock,
  listUnappliedStock,
  recordUnappliedStock,
} from "../stock-recovery";
import { clearDiagnostics, listDiagnostics, reasonCode, recordDiagnostic } from "../diagnostics";

describe("unapplied stock movements", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("parks a failed movement and keys it on the movement id", () => {
    recordUnappliedStock({ movementId: "m1", productId: "p1", storeId: "S1", delta: -2, reason: "connection" });
    recordUnappliedStock({ movementId: "m1", productId: "p1", storeId: "S1", delta: -2, reason: "again" });
    expect(listUnappliedStock()).toHaveLength(1);
    expect(listUnappliedStock()[0]?.reason).toBe("again");
  });

  it("clears a movement once it lands", () => {
    recordUnappliedStock({ movementId: "m2", productId: "p2", storeId: null, delta: 5, reason: "x" });
    clearUnappliedStock("m2");
    expect(listUnappliedStock()).toHaveLength(0);
  });
});

describe("diagnostics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearDiagnostics();
  });

  it("records an event with codes only", () => {
    recordDiagnostic({ kind: "stock_delta_failed", entity: "products", code: "connection", recordId: "m1" });
    const [event] = listDiagnostics();
    expect(event?.kind).toBe("stock_delta_failed");
    expect(JSON.stringify(event)).not.toMatch(/pin|token|password|secret/i);
  });

  it("maps messages to short reason codes", () => {
    expect(reasonCode("Failed to fetch")).toBe("connection");
    expect(reasonCode("Could not find the function")).toBe("missing_backend_object");
    expect(reasonCode("permission denied")).toBe("not_permitted");
  });
});