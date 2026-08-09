/**
 * One authorisation path for every sensitive till action.
 *
 * 1. The branch rules say whether this action needs a manager PIN at all.
 * 2. An administrator is never prompted — the server records their approval.
 * 3. Everyone else gets the manager PIN dialog, checked in the database.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import {
  ManagerOverrideDialog,
  type OverrideRequest,
} from "@/components/pos/ManagerOverrideDialog";
import { useAuthOptional } from "@/lib/pos-auth";
import { usePosRules } from "@/lib/pos-rules.tsx";
import { GATE_RULE_KEY, requiresManagerPin, type GateAction } from "@/lib/pos-rules";
import { authorizeAsAdmin } from "@/lib/pos-rules.functions";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";

export type GateRequest = {
  action: GateAction;
  title: string;
  reason: string;
  storeId?: string | null;
  terminalId?: string | null;
  requestedBy?: string | null;
  detail?: string;
};

export type GateResult = { ok: boolean; grantToken: string | null };

type Ctx = { authorize: (request: GateRequest) => Promise<GateResult> };

const ManagerGateContext = createContext<Ctx | null>(null);

export function ManagerGateProvider({ children }: { children: ReactNode }) {
  const { rules } = usePosRules();
  const auth = useAuthOptional();
  const isAdmin = auth?.user?.role === "admin";
  const [pending, setPending] = useState<OverrideRequest | null>(null);
  const resolver = useRef<((grant: string | null) => void) | null>(null);

  const authorize = useCallback(
    async (request: GateRequest): Promise<GateResult> => {
      // 1 · the branch does not gate this action
      if (!requiresManagerPin(rules, request.action)) return { ok: true, grantToken: null };

      // 2 · administrators skip the prompt; the approval is logged server-side
      if (isAdmin) {
        try {
          const caller = await getPosCallerAuth();
          if (caller.accessToken) {
            const res = await authorizeAsAdmin({
              data: {
                accessToken: caller.accessToken,
                action: request.action,
                ruleKey: GATE_RULE_KEY[request.action],
                ...(request.storeId ? { storeId: request.storeId } : {}),
                ...(request.terminalId ? { terminalId: request.terminalId } : {}),
                ...(request.detail ? { detail: request.detail } : {}),
              },
            });
            if (res.ok) return { ok: true, grantToken: res.grantToken };
          }
        } catch {
          /* fall through — an admin is still allowed through */
        }
        return { ok: true, grantToken: null };
      }

      // 3 · everyone else: manager PIN, verified in the database
      const grant = await new Promise<string | null>((resolve) => {
        resolver.current = resolve;
        setPending({
          action: request.action,
          ruleKey: GATE_RULE_KEY[request.action],
          title: request.title,
          reason: request.reason,
          ...(request.storeId ? { storeId: request.storeId } : {}),
          ...(request.terminalId ? { terminalId: request.terminalId } : {}),
          ...(request.requestedBy ? { requestedBy: request.requestedBy } : {}),
          ...(request.detail ? { detail: request.detail } : {}),
        });
      });
      return { ok: !!grant, grantToken: grant };
    },
    [rules, isAdmin],
  );

  const value = useMemo<Ctx>(() => ({ authorize }), [authorize]);

  const finish = (grant: string | null) => {
    resolver.current?.(grant);
    resolver.current = null;
    setPending(null);
  };

  return (
    <ManagerGateContext.Provider value={value}>
      {children}
      <ManagerOverrideDialog
        request={pending}
        onClose={() => finish(null)}
        onApproved={(grantToken) => finish(grantToken)}
      />
    </ManagerGateContext.Provider>
  );
}

export function useManagerGate(): Ctx {
  return (
    useContext(ManagerGateContext) ?? {
      authorize: async () => ({ ok: true, grantToken: null }),
    }
  );
}