/**
 * A browser sitting on the sign-in screen must not talk to the central
 * database. Every table is protected per user, so background work started
 * before anyone signs in can only produce rejected requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tokens = vi.hoisted(() => ({ session: null as string | null, cashier: null as string | null }));
const auth = vi.hoisted(() => ({
  session: null as unknown,
  handler: null as null | ((event: string, session: unknown) => void),
}));

vi.mock("@/lib/pos-credentials", () => ({
  sessionTokenSync: () => tokens.session,
  cashierTokenSync: () => tokens.cashier,
}));

vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
        auth.handler = fn;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

import { hasSignedInIdentity, __setAuthSessionForTests } from "../session-presence";

describe("hasSignedInIdentity", () => {
  beforeEach(() => {
    tokens.session = null;
    tokens.cashier = null;
    __setAuthSessionForTests(false);
  });

  it("is false for a visitor on the sign-in screen", () => {
    expect(hasSignedInIdentity()).toBe(false);
  });

  it("is true once a cashier session token exists", () => {
    tokens.session = "sess-1";
    expect(hasSignedInIdentity()).toBe(true);
  });

  it("is true for a till that still holds its cashier token", () => {
    tokens.cashier = "cash-1";
    expect(hasSignedInIdentity()).toBe(true);
  });

  it("is true for a back-office account with a central session", () => {
    __setAuthSessionForTests(true);
    expect(hasSignedInIdentity()).toBe(true);
  });
});
