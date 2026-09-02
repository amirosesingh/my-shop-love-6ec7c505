import { beforeEach, describe, expect, it, vi } from "vitest";

/** No browser here: the smallest window the module actually touches. */
const store = new Map<string, string>();
const fakeWindow: Record<string, unknown> = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
};
(globalThis as unknown as { window: unknown }).window = fakeWindow;

vi.mock("../device-secrets", () => ({
  getDeviceSecret: async () => null,
  setDeviceSecret: async () => {},
}));

import {
  connectLocalDatabase,
  defaultLocalDbConfig,
  deriveLocalDbState,
  verifyLocalWrite,
  withIpcTimeout,
} from "@/core/local-db/local-db";
import { createRunGuard } from "../run-token";

const stubShell = (connect: (...a: unknown[]) => Promise<unknown>) => {
  fakeWindow.pos = { connect, setSetting: async () => ({ ok: true }) };
};

describe("local database connection state", () => {
  beforeEach(() => {
    store.clear();
    delete fakeWindow.pos;
  });

  it("reports connected once the shell has proved the database", () => {
    const view = deriveLocalDbState({
      available: true,
      configured: true,
      status: { connected: true },
    });
    expect(view.state).toBe("connected");
    expect(view.busy).toBe(false);
  });

  it("never shows connected while the UI is still working", () => {
    const view = deriveLocalDbState({
      available: true,
      configured: true,
      status: { connected: true },
      pending: "saving",
    });
    expect(view.state).toBe("saving");
    expect(view.busy).toBe(true);
  });

  it("asks for setup when nothing has ever been configured", () => {
    expect(deriveLocalDbState({ available: true, configured: false, status: null }).state).toBe(
      "not_configured",
    );
  });

  it("says unavailable, not connected, when the shell reports an error", () => {
    const view = deriveLocalDbState({
      available: true,
      configured: true,
      status: { connected: false, error: "Login failed" },
    });
    expect(view.state).toBe("failed");
    expect(view.detail).toBe("Login failed");
  });

  it("reconnects quietly when a saved config has not answered yet", () => {
    expect(
      deriveLocalDbState({ available: true, configured: true, status: { connected: false } }).state,
    ).toBe("initializing");
  });

  it("is unavailable in a plain browser", () => {
    expect(deriveLocalDbState({ available: false, configured: false, status: null }).state).toBe(
      "unavailable",
    );
  });

  it("returns as soon as the local database is verified", async () => {
    stubShell(async () => ({ ok: true, verified: true, activeDb: "POS_Master_2025" }));
    const res = await connectLocalDatabase(defaultLocalDbConfig);
    expect(res.ok).toBe(true);
    expect(res.activeDb).toBe("POS_Master_2025");
  });

  it("surfaces a refused connection as a failure", async () => {
    stubShell(async () => ({ ok: false, error: "Login failed for user" }));
    const res = await connectLocalDatabase(defaultLocalDbConfig);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Login failed");
  });

  it("turns a rejected IPC call into a failure instead of hanging", async () => {
    stubShell(async () => {
      throw new Error("IPC channel closed");
    });
    const res = await connectLocalDatabase(defaultLocalDbConfig);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("IPC channel closed");
  });

  it("gives up on a call that never answers", async () => {
    await expect(
      withIpcTimeout(new Promise(() => {}), 10, "The desktop shell did not answer."),
    ).rejects.toThrow("did not answer");
  });

  it("does nothing when there is no desktop shell", async () => {
    const res = await connectLocalDatabase(defaultLocalDbConfig);
    expect(res.ok).toBe(false);
  });

  it("does not require browser storage to connect", async () => {
    stubShell(async (config) => ({ ok: !!config, verified: true }));
    const res = await connectLocalDatabase(defaultLocalDbConfig);
    expect(res.ok).toBe(true);
    expect([...store.keys()].some((key) => key.includes("localdb"))).toBe(false);
  });
});

describe("write verification", () => {
  beforeEach(() => {
    store.clear();
    delete fakeWindow.pos;
  });

  it("explains itself instead of throwing when there is no desktop shell", async () => {
    const res = await verifyLocalWrite();
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Windows desktop app");
  });

  it("passes when the shell writes and rolls back", async () => {
    fakeWindow.pos = {
      verifyWrite: async () => ({ ok: true, activeDb: "POS_Master_2025", rolledBack: true }),
    };
    const res = await verifyLocalWrite();
    expect(res.ok).toBe(true);
    expect(res.activeDb).toBe("POS_Master_2025");
  });

  it("fails as a timeout rather than hanging when the shell never answers", async () => {
    fakeWindow.pos = { verifyWrite: () => new Promise(() => {}) };
    const res = await verifyLocalWrite(10);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("ETIMEOUT");
  });

  it("reports a read-only login as a failed write, not a success", async () => {
    fakeWindow.pos = {
      verifyWrite: async () => ({
        ok: false,
        code: "EPERM",
        error: "INSERT permission was denied on object 'pos_connection_health'",
      }),
    };
    const res = await verifyLocalWrite();
    expect(res.ok).toBe(false);
    expect(res.error).toContain("INSERT permission");
  });
});

describe("stale run guard", () => {
  it("keeps the current run live", () => {
    const guard = createRunGuard();
    const token = guard.start();
    expect(guard.isLive(token)).toBe(true);
  });

  it("drops a result that arrives after the dialog closed", () => {
    const guard = createRunGuard();
    const token = guard.start();
    guard.abandon(); // dialog closed mid-handshake
    expect(guard.isLive(token)).toBe(false);
  });

  it("drops the earlier run when a new one starts", () => {
    const guard = createRunGuard();
    const first = guard.start();
    const second = guard.start();
    expect(guard.isLive(first)).toBe(false);
    expect(guard.isLive(second)).toBe(true);
  });
});