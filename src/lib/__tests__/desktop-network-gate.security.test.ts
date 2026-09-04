/**
 * The desktop shell fetches addresses the window supplies, so the address
 * gate is a security boundary: only secure requests to the configured update
 * hosts may leave the machine.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

// The gate lives in the desktop process and pulls in Electron; a stub is
// enough because the check itself never opens a socket.
vi.mock("electron", () => ({ net: { request: () => ({}) } }));

type Gate = { checkUrl: (value: unknown) => { ok: boolean; error?: string } };
let gate: Gate;

beforeAll(async () => {
  // @ts-expect-error - desktop shell module, plain CommonJS with no types
  gate = (await import("../../../electron/net.cjs")) as unknown as Gate;
});

const allowed = "https://updatecms.luckycharmsdnbhd.com/pos-app/manifest.json";

describe("desktop network gate", () => {
  it("allows the configured update host", () => {
    expect(gate.checkUrl(allowed).ok).toBe(true);
  });

  it("refuses anything that is not a secure web address", () => {
    for (const url of [
      "http://updatecms.luckycharmsdnbhd.com/pos-app/manifest.json",
      "file:///C:/Windows/win.ini",
      "data:text/plain,hello",
      "javascript:alert(1)",
      "blob:https://updatecms.luckycharmsdnbhd.com/abc",
      "not a url",
      "",
      null,
      42,
    ]) {
      expect(gate.checkUrl(url).ok, String(url)).toBe(false);
    }
  });

  it("refuses hosts that are not update servers", () => {
    for (const url of [
      "https://evil.example.com/payload.bin",
      "https://updatecms.luckycharmsdnbhd.com.evil.example/manifest.json",
      // Built at run time so no project address is written in source.
      `https://${"a".repeat(20)}.supabase.co/rest/v1/sales`,
    ]) {
      expect(gate.checkUrl(url).ok, url).toBe(false);
    }
  });

  it("refuses this machine and the local network", () => {
    for (const url of [
      "https://localhost/admin",
      "https://127.0.0.1/admin",
      "https://192.168.1.1/router",
      "https://10.0.0.5/internal",
      "https://172.16.4.4/internal",
      "https://169.254.169.254/latest/meta-data/",
      "https://printer.local/print",
    ]) {
      expect(gate.checkUrl(url).ok, url).toBe(false);
    }
  });
});
