import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");

describe("self-privilege guards", () => {
  it.each(["app_users_block_self_privilege_change", "user_roles_block_self_grant"])(
    "%s is installed in the canonical schema",
    (name) => {
      expect(schema).toContain(`CREATE TRIGGER ${name}`);
      expect(schema).toContain(`EXECUTE FUNCTION public.${name}()`);
      expect(schema).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}()`);
    },
  );

  it("refuses a change to one's own role, permissions, branch or access", () => {
    for (const column of ["NEW.role", "NEW.permissions", "NEW.store_id", "NEW.is_active"]) {
      expect(schema).toContain(column);
    }
    expect(schema).toContain("auth.uid()");
  });

  it("keeps transfers and their lines scoped to the staff member's branch", () => {
    expect(schema).toContain("transfer_in_my_branch");
    expect(schema).toContain("user_has_store_access(from_store_id)");
  });
});
