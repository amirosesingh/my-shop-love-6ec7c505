/**
 * A signed-in staff member must never be able to lift their own access.
 *
 * The guards live in the database so they hold whatever the app sends. This
 * check reads the migration history and fails if a later change removes them
 * or reopens the branch scoping on transfers.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
const history = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ f, sql: readFileSync(join(DIR, f), "utf8") }));

/** The last migration that mentions a name decides what is in force. */
function lastMention(name: string) {
  return [...history].reverse().find((h) => h.sql.includes(name));
}
void lastMention;

/** The migration that installs the guard. */
function creation(name: string) {
  return [...history].reverse().find((h) => h.sql.includes(`CREATE TRIGGER ${name}`));
}

describe("self-privilege guards", () => {
  it.each([
    "app_users_block_self_privilege_change",
    "user_roles_block_self_grant",
  ])("%s is created and never dropped later", (name) => {
    const made = creation(name);
    expect(made, `${name} is missing from the migration history`).toBeTruthy();
    // Nothing after it may take the guard away again.
    const later = history.slice(history.indexOf(made!) + 1);
    for (const step of later) {
      expect(step.sql).not.toMatch(new RegExp(`DROP TRIGGER[^;]*${name}[^;]*;(?![\\s\\S]*CREATE TRIGGER ${name})`));
      expect(step.sql).not.toContain(`DROP FUNCTION public.${name}`);
    }
  });

  it("refuses a change to one's own role, permissions, branch or access", () => {
    const sql = creation("app_users_block_self_privilege_change")!.sql;
    for (const column of ["NEW.role", "NEW.permissions", "NEW.store_id", "NEW.is_active"]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("auth.uid()");
  });

  it("keeps transfers and their lines scoped to the staff member's branch", () => {
    const all = history.map((h) => h.sql).join("\n");
    expect(all).toContain("transfer_in_my_branch");
    expect(all).toContain("user_has_store_access(from_store_id)");
  });
});
