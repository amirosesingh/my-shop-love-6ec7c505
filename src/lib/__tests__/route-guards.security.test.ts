import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_DIR = join(process.cwd(), "src/routes");
const APP_SHELL = readFileSync(join(process.cwd(), "src/platforms/web/components/pos/AppShell.tsx"), "utf8");
const NAV = readFileSync(join(process.cwd(), "src/platforms/web/components/pos/nav-config.ts"), "utf8");

const routeFiles = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".tsx") && !f.startsWith("__"));

/** Screens that must never render outside the permission-gated shell. */
/** Customer-facing screens: the display pole plus the member signup and
 *  voucher pages served on the member./redeem. subdomains. */
const PUBLIC_ROUTES = new Set([
  "display.tsx",
  "join.tsx",
  "claim.$campaignSlug.tsx",
  "c.$tokenSlug.tsx",
  // Emergency access: the connection-repair screen a till or phone opens when
  // it cannot reach the backend. It must not sit behind the shell, because the
  // shell needs the very connection this screen exists to fix. It carries only
  // the (non-secret) backend address and central database URL + publishable
  // key, and reads no business data.
  "recovery.tsx",
]);

/**
 * A redirect-only stub keeps an old bookmark working: it declares no
 * `component`, throws `redirect(...)` in `beforeLoad`, and so never renders a
 * page body. There is nothing to guard and nothing to leak — the destination
 * it forwards to carries the permission.
 */
const isRedirectOnly = (src: string) =>
  !/\bcomponent\s*:/.test(src) && /\bredirect\(/.test(src) && /beforeLoad/.test(src);

const redirectOnly = new Set(
  routeFiles.filter((f) => isRedirectOnly(readFileSync(join(ROUTES_DIR, f), "utf8"))),
);

describe("route guards", () => {
  it("every screen renders inside AppShell, which enforces login + permissions", () => {
    const unguarded = routeFiles.filter((f) => {
      if (PUBLIC_ROUTES.has(f)) return false;
      if (redirectOnly.has(f)) return false;
      const src = readFileSync(join(ROUTES_DIR, f), "utf8");
      // SectionHub and SettingsFrame both render inside AppShell.
      return (
        !src.includes("AppShell") && !src.includes("SettingsFrame") && !src.includes("SectionHub")
      );
    });
    expect(unguarded).toEqual([]);
  });

  it("AppShell still blocks anonymous access and gates admin paths", () => {
    // Matched on structure, not exact spelling: the guard may be wrapped over
    // several lines, but it must still short-circuit to the sign-in screen.
    expect(APP_SHELL).toMatch(/if\s*\(!user\)[\s\S]{0,600}?<TerminalLogin\s*\/>/);
    for (const path of ["/settings", "/staff", "/promotions", "/audit"]) {
      expect(APP_SHELL).toContain(`"${path}":`);
    }
  });

  /** Sidebar-only hiding is not a guard: a signed-in cashier can still type
   *  the URL. Every screen must have an entry in the AppShell route map. */
  it("every screen has a permission entry in the route guard map", () => {
    const OPEN_ROUTES = new Set(["index.tsx", ...PUBLIC_ROUTES]);
    const missing = routeFiles
      .filter((f) => !OPEN_ROUTES.has(f) && !redirectOnly.has(f))
      .map((f) => `/${f.replace(/\.tsx$/, "").split(".")[0]}`)
      .filter((path, i, all) => all.indexOf(path) === i)
      .filter((path) => !APP_SHELL.includes(`"${path}"`));
    expect(missing).toEqual([]);
  });

  /** The two screens that change stock by hand and expose member contact
   *  history must never be reachable on the fail-closed default alone. */
  it("stock operations and the verification log declare their permission", () => {
    expect(APP_SHELL).toContain('"/stock-operations": "can_adjust_stock"');
    expect(APP_SHELL).toContain('"/verifications": "can_view_member_history"');
  });

  /** A missing map entry must fail closed, and access must be decided before
   *  the page body renders — a post-render redirect leaks protected data. */
  it("denies unmapped routes instead of falling through to open access", () => {
    expect(APP_SHELL).toContain('const PUBLIC_ROUTES = new Set(["/", "/display"])');
    expect(APP_SHELL).toContain('return ROUTE_PERMISSIONS[key] ?? "unknown"');
    // The denial screen (which names the missing permission) renders instead
    // of the page body.
    expect(APP_SHELL).toContain("<PermissionDenied");
    // The old post-render redirect guard must not come back.
    expect(APP_SHELL).not.toContain("useNavigate");
  });

  it("every report screen requires the sales-reports permission in the sidebar", () => {
    // Entries span several lines, so check each `{ ... }` block that points at
    // a report screen. `hubTo` is the section landing page, not an entry.
    const entries = NAV.split("{").filter(
      (block) => /\bto: "\/reports/.test(block) && !/hubTo:/.test(block.split("\n")[0] ?? ""),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const gated =
        entry.includes('flag: "can_view_sales_reports"') ||
        entry.includes('flag: "can_view_audit_trail"');
      expect(gated, entry).toBe(true);
    }
  });
});

describe("secret hygiene", () => {
  it("no service-role key or raw secret is referenced from client code", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.server\.tsx?$/.test(entry.name)) continue;
        if (/\.test\.tsx?$/.test(entry.name)) continue;
        const src = readFileSync(full, "utf8");
        if (/SERVICE_ROLE|service_role_key/i.test(src)) offenders.push(full);
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
