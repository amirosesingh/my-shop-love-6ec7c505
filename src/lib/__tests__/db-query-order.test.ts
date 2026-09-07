import { beforeEach, describe, expect, it, vi } from "vitest";

const { orders } = vi.hoisted(() => ({ orders: [] as string[] }));

vi.mock("@/integrations/supabase/external-client", () => ({
  supabaseExternal: {
    from: () => ({
      select: () => {
        const query = {
          eq: () => query,
          in: () => query,
          order: (column: string) => {
            orders.push(column);
            return query;
          },
          limit: () => query,
          range: () => Promise.resolve({ data: [], error: null, count: 0 }),
        };
        return query;
      },
    }),
  },
}));

vi.mock("@/core/local-db/db-mode", () => ({
  effectiveDatabaseMode: () => "online",
  isConnectionError: () => false,
}));

vi.mock("@/core/activation/connection-health", () => ({ lastHealth: () => null }));
vi.mock("@/lib/offline-snapshot", () => ({ readSnapshot: () => null }));
vi.mock("@/lib/row-versions", () => ({ noteVersions: () => undefined }));

import { routedQuery } from "@/core/api/db-query";

describe("routed query ordering", () => {
  beforeEach(() => orders.splice(0));

  it("does not append id when a composite-key table supplies its own order", async () => {
    await routedQuery("settings_overrides", {
      columns: "section,patch",
      match: { scope: "CLUSTER", scope_id: "361-degree" },
      orderBy: { column: "section" },
      limit: 1,
    });

    expect(orders).toEqual(["section"]);
  });

  it("retains id as the default order for ordinary entity tables", async () => {
    await routedQuery("products", { limit: 1 });

    expect(orders).toEqual(["id"]);
  });
});
