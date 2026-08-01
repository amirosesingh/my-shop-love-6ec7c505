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
      return !src.includes("AppShell") && !src.includes("SettingsFrame");
    });
    expect(unguarded).toEqual([]);
  });

  it("AppShell still blocks anonymous access and gates admin paths", () => {
    expect(APP_SHELL).toContain("if (!user) return <TerminalLogin />");
    for (const path of ["/settings", "/staff", "/promotions", "/audit"]) {
      expect(APP_SHELL).toContain(`"${path}":`);
    }
  });

  it("every report screen requires the sales-reports permission in the sidebar", () => {
    const reportLines = NAV.split("\n").filter((l) => l.includes('to: "/reports'));
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