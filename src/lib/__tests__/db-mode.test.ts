import { beforeEach, describe, expect, it } from "vitest";

// No browser here: a tiny stand-in for the two globals the module reads.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  navigator: { onLine: true },
  addEventListener: () => {},
  removeEventListener: () => {},
};
import {
  effectiveDatabaseMode,
  noteConnectionLost,
  noteConnectionRestored,
  preferredDatabaseMode,
  setPreferredDatabaseMode,
} from "../db-mode";

describe("database mode", () => {
  beforeEach(() => {
    store.clear();
    noteConnectionRestored();
  });

  it("defaults to local-first on a till", () => {
    expect(preferredDatabaseMode()).toBe("local");
  });

  it("writes online when online mode is chosen and the connection is up", () => {
    setPreferredDatabaseMode("online");
    expect(effectiveDatabaseMode()).toBe("online");
  });

  it("fails over to local without changing the chosen mode", () => {
    setPreferredDatabaseMode("online");
    noteConnectionLost();
    expect(effectiveDatabaseMode()).toBe("local");
    expect(preferredDatabaseMode()).toBe("online");
    noteConnectionRestored();
    expect(effectiveDatabaseMode()).toBe("online");
  });
});