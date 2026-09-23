import { beforeEach, describe, expect, it, vi } from "vitest";

const { serviceRest } = vi.hoisted(() => ({ serviceRest: vi.fn() }));
vi.mock("@/core/api/pos-relay.server", () => ({ serviceRest }));

import { databaseAuthority } from "../desktop-database-authority.server";

describe("desktop database authority", () => {
  beforeEach(() => serviceRest.mockReset());

  it("uses the full administrator preset even when an old row stores false", async () => {
    serviceRest.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          user_id: "admin-1",
          role: "admin",
          role_slug: "admin",
          permissions: { can_manage_sync_backup: false },
          store_id: "branch-7",
          is_active: true,
        },
      ],
    });
    await expect(databaseAuthority({ userId: "admin-1" })).resolves.toMatchObject({
      level: "admin",
      branchId: "branch-7",
      permissions: { can_manage_sync_backup: true },
    });
  });
});
