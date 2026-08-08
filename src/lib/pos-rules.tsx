/**
 * Client access to the database-backed POS rules.
 *
 * Nothing here is cached in localStorage or sessionStorage: a refresh
 * refetches from the server, and until the fetch lands the UI uses the
 * strictest defaults. The frontend only hides / disables things — every
 * privileged action is re-validated on the server.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getPosRules } from "./pos-rules.functions";
import { getPosCallerAuth } from "./pos-caller-auth";
import { DEFAULT_POS_RULES, type PosRules } from "./pos-rules";

type Ctx = { rules: PosRules; loading: boolean; refresh: () => void };

const RulesContext = createContext<Ctx | null>(null);

export function PosRulesProvider({
  storeId,
  children,
}: {
  storeId?: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const key = ["pos-rules", storeId ?? ""] as const;

  const query = useQuery({
    queryKey: key,
    // Rules are security state: always re-check with the server on mount,
    // on focus and after a sign-in, never read them back from storage.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const auth = await getPosCallerAuth();
      // Works signed in or not: without credentials the server answers with
      // the global defaults rather than an error.
      try {
        const res = await getPosRules({ data: { ...auth, storeId: storeId ?? "" } });
        return res.rules as PosRules;
      } catch {
        return DEFAULT_POS_RULES;
      }
    },
  });

  const value = useMemo<Ctx>(
    () => ({
      rules: query.data ?? DEFAULT_POS_RULES,
      loading: query.isPending,
      refresh: () => void queryClient.invalidateQueries({ queryKey: ["pos-rules"] }),
    }),
    [query.data, query.isPending, queryClient],
  );

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

export function usePosRules(): Ctx {
  return (
    useContext(RulesContext) ?? { rules: DEFAULT_POS_RULES, loading: false, refresh: () => {} }
  );
}