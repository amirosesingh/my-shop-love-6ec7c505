import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_DIR = join(process.cwd(), "src/routes");
const APP_SHELL = readFileSync(join(process.cwd(), "src/components/pos/AppShell.tsx"), "utf8");
const NAV = readFileSync(join(process.cwd(), "src/components/pos/nav-config.ts"), "utf8");

const routeFiles = readdirSync(ROUTES_DIR).filter(
  (f) => f.endsWith(".tsx") && !f.startsWith("__"),
);

/** Screens that must never render outside the permission-gated shell. */
const PUBLIC_ROUTES = new Set(["display.tsx"]);

describe("route guards", () => {
  it("every screen renders inside AppShell, which enforces login + permissions", () => {
    const unguarded = routeFiles.filter((f) => {
      if (PUBLIC_ROUTES.has(f)) return false;
      const src = readFileSync(join(ROUTES_DIR, f), "utf8");
      // SectionHub and SettingsFrame both render inside AppShell.
      return (
        !src.includes("AppShell") &&
        !src.includes("SettingsFrame") &&
        !src.includes("SectionHub")
      );
    });
    expect(unguarded).toEqual([]);
  });

  it("AppShell still blocks anonymous access and gates admin paths", () => {
    expect(APP_SHELL).toContain("if (!user) return <TerminalLogin />");
    for (const path of ["/settings", "/staff", "/promotions", "/audit"]) {
      expect(APP_SHELL).toContain(`"${path}":`);
    }
  });

  /** Sidebar-only hiding is not a guard: a signed-in cashier can still type
   *  the URL. Every screen must have an entry in the AppShell route map. */
  it("every screen has a permission entry in the route guard map", () => {
    const OPEN_ROUTES = new Set(["index.tsx", "display.tsx"]);
    const missing = routeFiles
      .filter((f) => !OPEN_ROUTES.has(f))
      .map((f) => `/${f.replace(/\.tsx$/, "").split(".")[0]}`)
      .filter((path, i, all) => all.indexOf(path) === i)
      .filter((path) => !APP_SHELL.includes(`"${path}"`));
    expect(missing).toEqual([]);
  });

  /** A missing map entry must fail closed, and access must be decided before
   *  the page body renders — a post-render redirect leaks protected data. */
  it("denies unmapped routes instead of falling through to open access", () => {
    expect(APP_SHELL).toContain("const PUBLIC_ROUTES = new Set([\"/\", \"/display\"])");
    expect(APP_SHELL).toContain('return ROUTE_PERMISSIONS[key] ?? "unknown"');
    expect(APP_SHELL).toContain("Access restricted");
    // The old post-render redirect guard must not come back.
    expect(APP_SHELL).not.toContain("useNavigate");
  });

  it("every report screen requires the sales-reports permission in the sidebar", () => {
    const reportLines = NAV
      .split("\n")
      // hubTo is the section landing page, not a report screen entry.
      .filter((l) => l.includes('to: "/reports') && !l.includes("hubTo:"));
    expect(reportLines.length).toBeGreaterThan(0);
    for (const line of reportLines) {
      expect(line, line).toContain('flag: "can_view_sales_reports"');
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