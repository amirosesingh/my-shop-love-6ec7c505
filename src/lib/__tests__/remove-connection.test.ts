import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  deriveLocalDbState,
  reconnectLocalDatabase,
  removeStoredConnection,
} from "@/core/local-db/local-db";

/**
 * Removing a saved connection has to be a real removal: the credentials go,
 * anything in flight is cancelled and the background retry loop stops. And
 * "Reconnect now" must retry what the operator has on screen, not the file
 * that is already known to be wrong.
 */

type Bridge = Record<string, unknown>;

function installBridge(bridge: Bridge) {
  (globalThis as unknown as { window: unknown }).window = { pos: bridge };
}

beforeEach(() => {
  installBridge({});
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("removing the saved connection", () => {
  it("asks the shell to delete the stored credentials", async () => {
    const removeConnection = vi.fn().mockResolvedValue({ ok: true, removed: true });
    installBridge({ removeConnection });
    const res = await removeStoredConnection();
    expect(removeConnection).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true, removed: true });
  });

  it("explains itself when there is no desktop shell", async () => {
    const res = await removeStoredConnection();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/desktop app/i);
  });

  it("leaves the panel on a clean 'requires setup' state afterwards", () => {
    const view = deriveLocalDbState({ available: true, configured: false, status: null });
    expect(view.state).toBe("not_configured");
    expect(view.busy).toBe(false);
    expect(view.message).not.toMatch(/Trying to reach/i);
  });
});

describe("reconnect now", () => {
  it("passes unsaved form values through to the shell", async () => {
    const reconnect = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ reconnect });
    await reconnectLocalDatabase({
      server: "localhost\\SQLEXPRESS",
      port: 1433,
      directConnect: true,
    });
    expect(reconnect).toHaveBeenCalledWith(
      expect.objectContaining({ port: 1433, directConnect: true }),
    );
  });

  it("falls back to the saved config when the form was never touched", async () => {
    const reconnect = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ reconnect });
    await reconnectLocalDatabase();
    expect(reconnect).toHaveBeenCalledWith(undefined);
  });
});

describe("failure banner", () => {
  it("shows the driver's own reason rather than a generic line", () => {
    const view = deriveLocalDbState({
      available: true,
      configured: true,
      status: {
        connected: false,
        error: "Could not reach localhost\\SQLEXPRESS.",
        errorHint: "Start the SQL Server Browser service or enter a fixed port.",
      },
    });
    expect(view.state).toBe("failed");
    expect(view.detail).toContain("fixed port");
  });
});
