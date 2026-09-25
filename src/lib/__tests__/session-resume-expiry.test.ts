import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  sessionReason: "idle" as "idle" | "revoked" | "unavailable" | "ok",
  relay: vi.fn(),
}));

vi.mock("@/core/api/pos-relay.server", () => ({
  hasServiceKey: () => true,
  serviceRest: vi.fn(),
  verifyRelayCaller: mocks.relay,
}));

vi.mock("@/lib/session-guard.server", () => ({
  touchSession: vi.fn(async () =>
    mocks.sessionReason === "ok"
      ? { ok: true, session: { kind: "staff", label: "Sam", branch_id: null } }
      : { ok: false, reason: mocks.sessionReason },
  ),
}));

import { verifySessionServer } from "@/lib/session-verify.server";

describe("session verification after resume", () => {
  beforeEach(() => {
    mocks.sessionReason = "idle";
    mocks.relay.mockReset();
    mocks.relay.mockResolvedValue({ kind: "staff", label: "Sam", storeId: null });
  });

  it("does not let a refreshed Auth token hide an idle-expired POS session", async () => {
    await expect(
      verifySessionServer({
        sessionToken: "expired-person-session",
        accessToken: "still-refreshable-supabase-session",
        terminalToken: "registered-terminal",
      }),
    ).resolves.toEqual({ ok: false, reason: "revoked" });
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("keeps connectivity failures non-destructive", async () => {
    mocks.sessionReason = "unavailable";
    await expect(
      verifySessionServer({ sessionToken: "person-session", accessToken: "auth-token" }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(mocks.relay).not.toHaveBeenCalled();
  });
});

describe("logout scope", () => {
  it("ends only this device session instead of every Supabase login", () => {
    const auth = readFileSync("src/lib/pos-auth.tsx", "utf8");
    const activation = readFileSync("src/core/activation/terminal-tokens.ts", "utf8");
    expect(auth).not.toContain(".auth.signOut();");
    expect(activation).not.toContain(".auth.signOut();");
    expect(auth).toContain('.auth.signOut({ scope: "local" })');
    expect(activation).toContain('.auth.signOut({ scope: "local" })');
  });
});
