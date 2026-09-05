/**
 * Client access to the database-backed POS rules.
 *
 * Nothing here is written to localStorage or sessionStorage: rules are
 * security state, so a cold start always re-reads them from the server and
 * uses the strictest defaults until the answer lands. Within a running
 * session the last rule set the database actually served is kept in memory,
 * so a brief connection blip does not silently tighten every limit. The
 * frontend only hides / disables things — every privileged action is
 * re-validated on the server.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getPosRules } from "./pos-rules.functions";
import { getPosCallerAuth } from "./pos-caller-auth";
import { subscribeSettingsChange } from "./sync-engine";
import { DEFAULT_POS_RULES, type PosRules } from "./pos-rules";

/** Why the live values are not in use, in words a supervisor can act on. */
export type RulesFailureKind =
  | "none"
  | "config"
  | "network"
  | "auth"
  | "permission"
  | "data"
  | "unknown";

const FAILURE_TEXT: Record<RulesFailureKind, string> = {
  none: "",
  config: "This deployment has no central database connection configured.",
  auth: "The central database rejected this terminal's credentials.",
  permission: "This account is not allowed to read the saved rules.",
  data: "The saved rules are missing or in an unexpected shape.",
  network: "The central database could not be reached.",
  unknown: "The saved rules could not be read.",
};

type Ctx = {
  rules: PosRules;
  loading: boolean;
  /** True when the rules shown are the built-in defaults, not the saved ones. */
  usingDefaults: boolean;
  /** True when saved rules are in use but the last refresh failed. */
  degraded: boolean;
  failure: RulesFailureKind;
  /** Plain-language reason, safe to show to a supervisor. */
  failureText: string;
  backendError: string;
  /** Content stamp of the rule set in use, for diagnostics. */
  revision: string;
  lastSyncedAt: number | null;
  refresh: () => void;
};

const RulesContext = createContext<Ctx | null>(null);

type Snapshot = {
  rules: PosRules;
  usingDefaults: boolean;
  degraded: boolean;
  failure: RulesFailureKind;
  backendError: string;
  revision: string;
  lastSyncedAt: number | null;
};

/**
 * Last rule set the database actually served, per branch, for this session
 * only. Never persisted: a restart falls back to the strict defaults.
 */
const lastGood = new Map<string, { rules: PosRules; revision: string; at: number }>();

export function PosRulesProvider({
  storeId,
  children,
}: {
  storeId?: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const scope = storeId ?? "";
  const key = ["pos-rules", scope] as const;

  const query = useQuery<Snapshot>({
    queryKey: key,
    // Rules are security state: always re-check with the server on mount,
    // on focus, on reconnect and on a timer, never read them back from
    // storage.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async (): Promise<Snapshot> => {
      const auth = await getPosCallerAuth();
      const cached = lastGood.get(scope);
      // Works signed in or not: without credentials the server answers with
      // the global defaults rather than an error.
      try {
        const res = await getPosRules({ data: { ...auth, storeId: scope } });
        const failure = (res.failure ?? "unknown") as RulesFailureKind;
        if (res.backend === "database") {
          const at = typeof res.fetchedAt === "number" ? res.fetchedAt : Date.now();
          // A late answer must never put an older rule set back in place.
          if (!cached || at >= cached.at) {
            lastGood.set(scope, { rules: res.rules as PosRules, revision: res.revision ?? "", at });
          }
          const now = lastGood.get(scope)!;
          return {
            rules: now.rules,
            usingDefaults: false,
            degraded: false,
            failure: "none",
            backendError: "",
            revision: now.revision,
            lastSyncedAt: now.at,
          };
        }
        // The read failed. Keep the last configuration that was genuinely
        // served rather than tightening every limit for a passing blip; the
        // strict built-in fallback still applies when nothing trusted exists.
        if (cached) {
          return {
            rules: cached.rules,
            usingDefaults: false,
            degraded: true,
            failure,
            backendError: res.backendError ?? "",
            revision: cached.revision,
            lastSyncedAt: cached.at,
          };
        }
        return {
          rules: res.rules as PosRules,
          usingDefaults: true,
          degraded: false,
          failure,
          backendError: res.backendError ?? "",
          revision: "",
          lastSyncedAt: null,
        };
      } catch (e) {
        const message = (e as Error).message;
        if (cached) {
          return {
            rules: cached.rules,
            usingDefaults: false,
            degraded: true,
            failure: "network",
            backendError: message,
            revision: cached.revision,
            lastSyncedAt: cached.at,
          };
        }
        return {
          rules: DEFAULT_POS_RULES,
          usingDefaults: true,
          degraded: false,
          failure: "network",
          backendError: message,
          revision: "",
          lastSyncedAt: null,
        };
      }
    },
  });

  // An administrator changing a rule on a phone or PC reaches this till
  // through the one existing live settings channel; reconnecting after a
  // spell offline re-reads it too. No terminal has to be visited by hand.
  useEffect(
    () =>
      subscribeSettingsChange(() => {
        void queryClient.invalidateQueries({ queryKey: ["pos-rules"] });
      }),
    [queryClient],
  );

  const value = useMemo<Ctx>(() => {
    const failure = query.data?.failure ?? "none";
    return {
      rules: query.data?.rules ?? DEFAULT_POS_RULES,
      loading: query.isPending,
      usingDefaults: query.data?.usingDefaults ?? false,
      degraded: query.data?.degraded ?? false,
      failure,
      failureText: FAILURE_TEXT[failure] ?? "",
      backendError: query.data?.backendError ?? "",
      revision: query.data?.revision ?? "",
      lastSyncedAt: query.data?.lastSyncedAt ?? null,
      refresh: () => void queryClient.invalidateQueries({ queryKey: ["pos-rules"] }),
    };
  }, [query.data, query.isPending, queryClient]);

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

export function usePosRules(): Ctx {
  return (
    useContext(RulesContext) ?? {
      rules: DEFAULT_POS_RULES,
      loading: false,
      usingDefaults: false,
      degraded: false,
      failure: "none",
      failureText: "",
      backendError: "",
      revision: "",
      lastSyncedAt: null,
      refresh: () => {},
    }
  );
}
