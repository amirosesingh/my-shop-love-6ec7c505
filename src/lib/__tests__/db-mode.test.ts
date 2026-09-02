import { beforeEach, describe, expect, it } from "vitest";

// No browser here: a tiny stand-in for the two globals the module reads.
const store = new Map<string, string>();
const fakeWindow: Record<string, unknown> = {
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
(globalThis as unknown as { window: unknown }).window = fakeWindow;

/** The desktop preload exposes `window.pos`; that is how the app knows it is
 *  running on a till rather than in a back-office browser tab. */
const asDesktop = () => void (fakeWindow.pos = {});
const asBrowser = () => void delete fakeWindow.pos;
import {
  effectiveDatabaseMode,
  noteConnectionLost,
  noteConnectionRestored,
  preferredDatabaseMode,
  setPreferredDatabaseMode,
} from "@/core/local-db/db-mode";

describe("database mode", () => {
  beforeEach(() => {
    store.clear();
    asBrowser();
    noteConnectionRestored();
  });

  it("defaults to local-first on a till", () => {
    asDesktop();
    expect(preferredDatabaseMode()).toBe("local");
    expect(effectiveDatabaseMode()).toBe("local");
  });

  it("defaults to online in a back-office browser, which has no local engine", () => {
    expect(preferredDatabaseMode()).toBe("online");
  });

  it("writes online when online mode is chosen and the connection is up", () => {
    setPreferredDatabaseMode("online");
    expect(effectiveDatabaseMode()).toBe("online");
  });

  it("fails over to local on a till without changing the chosen mode", () => {
    asDesktop();
    setPreferredDatabaseMode("online");
    noteConnectionLost();
    expect(effectiveDatabaseMode()).toBe("local");
    expect(preferredDatabaseMode()).toBe("online");
    noteConnectionRestored();
    expect(effectiveDatabaseMode()).toBe("online");
  });
});
