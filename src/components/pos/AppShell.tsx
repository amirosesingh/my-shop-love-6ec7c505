import {
  Loader2,
  Lock,
  LogOut,
  Menu,
  MapPin,
  ReceiptText,
  Settings as SettingsIcon,
  Store,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePos } from "@/lib/pos-store";
import { useAuth, type PermissionFlag } from "@/lib/pos-auth";
import { Link, useLocation } from "@tanstack/react-router";
import { TerminalLogin } from "@/components/pos/TerminalLogin";
import { TerminalActivation, TerminalRevokedScreen } from "@/components/pos/TerminalActivation";
import { clearRevocation, useRevocationCheck } from "@/lib/use-revocation-check";
import { useStartupGate } from "@/core/activation/registration-status";
import { ConnectDatabaseScreen } from "@/components/pos/ConnectDatabaseScreen";
import { useAutoLock } from "@/lib/auto-lock";
import { SidebarNav, useSidebarCollapsed } from "@/components/pos/SidebarNav";
import {
  ConnectionStatusButton,
  SystemAlertsButton,
} from "@/components/pos/StatusCluster";
import { WindowControls } from "@/components/pos/WindowControls";


import { ActivityBell } from "@/components/pos/ActivityBell";
import { MobileStatusSheet } from "@/components/pos/MobileStatusSheet";
import { ShiftGuard } from "@/components/pos/ShiftGuard";
import { PermissionDenied } from "@/components/pos/PermissionGate";
import { useVisibility } from "@/lib/ui-visibility";

import { LiveClock } from "@/components/pos/LiveClock";
import { ThemeToggle } from "@/components/pos/ThemeToggle";
import { startSyncEngine } from "@/lib/sync-engine";
import { hydrateBillSequence } from "@/lib/bill-number";
import { startDatabaseModeWatch } from "@/core/local-db/db-mode";
import { DbConnectionModal } from "@/components/pos/DbConnectionModal";
import { UpdateHeaderButton } from "@/components/pos/UpdateHeaderButton";
import type { NavItem } from "@/components/pos/nav-config";
import { setPrintStore, setPrintSettings, setServiceTerms } from "@/lib/pos-print";
import { bookingRulesOf } from "@/lib/pos-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUiScale } from "@/lib/use-ui-scale";
import { useBranding, isDesktop } from "@/lib/branding";
import { isNative } from "@/platform-config/platform";
import { setBranchId } from "@/lib/activity-journal";
import { soleBranchId } from "@/lib/active-branch";
import { flushWhatsAppQueue } from "@/lib/whatsapp";
import { closeCustomerDisplay } from "@/lib/customer-display";
import { reportAppReady } from "@/lib/app-health";
import { localDb } from "@/core/local-db/local-db";
import { supabaseConfig } from "@/lib/external-supabase-config";
import { initCloudConfigFromShell } from "@/lib/secure-cloud-config";
import { CloudSetupGate } from "@/components/pos/CloudSetupGate";
import { readCredentials } from "@/lib/pos-credentials";
import { TillLoader } from "@/components/pos/TillLoader";
import { LocationBootGuard } from "@/components/pos/LocationBootGuard";

/** Permission required to open each screen. Keys are path prefixes, so child
 *  pages (/settings/tax, /reports/sales …) inherit the parent gate unless they
 *  declare their own. `/` (register) and `/display` are intentionally open to
 *  every signed-in account. Keep this in sync with nav-config.ts. */
const ROUTE_PERMISSIONS: Record<string, PermissionFlag> = {
  "/settings/terminals": "can_manage_terminals",
  "/settings/mobile-terminals": "can_manage_terminals",
  "/settings/sessions": "can_manage_terminals",
  "/settings/sync": "can_manage_sync_backup",
  "/settings/database": "can_manage_sync_backup",
  "/settings": "can_access_pos_settings",
  "/staff": "can_manage_staff",
  "/stores": "can_manage_locations",
  "/promotions": "can_manage_promotions",
  "/coupons": "can_manage_promotions",
  "/suppliers": "can_receive_purchase_order",
  "/approvals": "can_view_audit_trail",
  "/audit": "can_view_audit_trail",
  "/dashboard": "can_view_dashboard",
  "/analytics": "can_view_sales_reports",
  "/holds": "can_hold_cart",
  "/reports/activity": "can_view_audit_trail",
  "/reports": "can_view_sales_reports",
  "/receipts": "can_view_sales_reports",
  "/shifts": "can_close_shift",
  "/inventory": "can_view_inventory",
  "/all-shops": "can_view_inventory",
  "/purchasing": "can_receive_purchase_order",
  "/transfers": "can_create_transfer",
  "/requests": "can_create_transfer",
  "/receiving": "can_receive_transfer",
  "/bookings": "can_manage_bookings",
  "/members": "can_add_member",
  "/stock-operations": "can_adjust_stock",
  "/verifications": "can_view_member_history",
};

/** The only screens any signed-in account may open. Everything else must have
 *  an entry above — unknown paths are denied, never silently allowed. */
const PUBLIC_ROUTES = new Set(["/", "/display"]);

/** Section landing pages. They only list links, and every card is filtered by
 *  the same permission as the sidebar entry, so the hub itself carries no
 *  protected data. */
const SECTION_HUBS = new Set(["/sales", "/inventory-hub", "/customers", "/admin"]);

/** Cloud-only admin tools. The Windows till never manages accounts, branches,
 *  messaging credentials or device activation — those stay in the web console. */
const DESKTOP_BLOCKED = [
  "/settings/terminals",
  "/settings/mobile-terminals",
  "/settings/sessions",
  "/settings/whatsapp",
  "/staff",
  "/stores",
];

const isDesktopBlocked = (pathname: string) =>
  DESKTOP_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Longest matching prefix wins so a child page can tighten its parent gate. */
function requiredPermission(pathname: string): PermissionFlag | null | "unknown" {
  if (PUBLIC_ROUTES.has(pathname)) return null;
  if (SECTION_HUBS.has(pathname)) return null;
  const key =
    Object.keys(ROUTE_PERMISSIONS)
      .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
      .sort((a, b) => b.length - a.length)[0] ?? "";
  return ROUTE_PERMISSIONS[key] ?? "unknown";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { activeShift, stores, currentStore, setCurrentStore, state, ready: dataReady } = usePos();
  const { ready, user, isAdmin, canSwitchStores, terminalStoreId, logout, lock, can } = useAuth();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Set when the operator chooses to carry on from the terminal's own copy
  // after the first load could not reach the central database.
  const [offlineBypass, setOfflineBypass] = useState(false);
  const branding = useBranding();
  // Windows tills must be registered to a location before they can be used.
  const terminal = useRevocationCheck();
  // Registration and connectivity are read separately: a dead link must never
  // look like a failed activation.
  const startup = useStartupGate();
  const location = useLocation();
  const { visibleRoute } = useVisibility();

  // Terminal-wide font / control scaling preference.
  useUiScale();

  // Idle screens return to the sign-in keypad. The shift stays open.
  useAutoLock(!!user, () => {
    void lock();
  });

  // Background outbox drain: keeps offline sales flowing once the link returns.
  useEffect(() => startSyncEngine(), []);
  // The bill counter lives in the branch database; restore it before the first
  // sale so a cleared browser profile cannot restart numbering.
  useEffect(() => {
    void hydrateBillSequence();
  }, []);
  // Hand this device's cloud connection details to Electron's sync worker on
  // every launch. The keys sealed in the platform vault win over anything
  // baked into the build; with no keys saved yet the shell boots its worker
  // from its own sealed store once an admin saves them in Settings.
  useEffect(() => {
    const bridge = localDb();
    if (!bridge) return;
    void (async () => {
      await initCloudConfigFromShell().catch(() => {});
      let cloud: { url: string; key: string } | null = null;
      try {
        cloud = supabaseConfig();
      } catch {
        // Unconfigured device — trading stays local, sync stays parked.
      }
      if (!cloud) return;
      const credentials = await readCredentials();
      void bridge.configureCloud({
        url: cloud.url,
        key: cloud.key,
        ...credentials,
        branchId: terminal.config?.locationId ?? currentStore?.id,
      });
    })();
  }, [
    terminal.config?.supabaseUrl,
    terminal.config?.supabaseKey,
    terminal.config?.locationId,
    user?.staffId,
  ]);
  // Keeps the database-mode pill and the automatic local failover honest.
  useEffect(() => startDatabaseModeWatch(), []);

  // Tells the desktop shell this build actually started, so it never falls
  // back into safe mode after a healthy launch.
  useEffect(() => reportAppReady(), []);

  // Bills queued while offline go out as soon as the link is back.
  useEffect(() => {
    const flush = () => void flushWhatsAppQueue().catch(() => {});
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  // The customer screen must never outlive the till: when this window goes
  // away, shut the second screen down with it.
  useEffect(() => {
    if (window.location.pathname.startsWith("/display")) return;
    const shutdown = () => closeCustomerDisplay();
    window.addEventListener("pagehide", shutdown);
    window.addEventListener("beforeunload", shutdown);
    return () => {
      window.removeEventListener("pagehide", shutdown);
      window.removeEventListener("beforeunload", shutdown);
    };
  }, []);

  useEffect(() => {
    setPrintStore(currentStore ?? null);
  }, [currentStore]);

  // Stamp every journal entry and queued write with the branch in use.
  useEffect(() => {
    setBranchId(currentStore?.id ?? null);
  }, [currentStore]);

  useEffect(() => {
    setPrintSettings(state.settings.receipt, state.settings.tax, state.settings.integrations.rounding);
  }, [state.settings]);

  // The liability wording lives with the booking rules but is printed by the
  // receipt layer, so push it across whenever the rules change.
  useEffect(() => {
    setServiceTerms(bookingRulesOf(state.settings.integrations.bookingRules).serviceTerms);
  }, [state.settings]);

  // A registered till fixes the branch for everyone signed in on it; otherwise
  // an account with a single assigned branch is pinned to that one.
  // The phone app is an admin tool: an admin on Android keeps the freedom to
  // look at any branch, so the terminal pin does not apply to them there.
  useEffect(() => {
    if (isNative() && isAdmin) return;
    const pinned = terminalStoreId ?? (canSwitchStores ? null : (user?.storeId ?? soleBranchId()));
    if (user && pinned && currentStore.id !== pinned) setCurrentStore(pinned);
  }, [user, isAdmin, canSwitchStores, terminalStoreId, currentStore.id, setCurrentStore]);

  if (!ready) return null;
  // Every activated terminal, including a browser-based till, must finish
  // unsealing its tenant configuration before any data read or write starts.
  if (terminal.hydrating)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  // Desktop tills and Android terminals both have to register before use.
  if (isDesktop() || isNative()) {
    if (terminal.revoked) return <TerminalRevokedScreen onReactivate={clearRevocation} />;
    if (!terminal.config) {
      // Step 1 — no usable database connection yet: ask for the URL and key.
      if (startup.cloudConfigured === false || !startup.cloudConnected)
        return (
          <ConnectDatabaseScreen
            cloudConfigured={Boolean(startup.cloudConfigured)}
            onRetry={startup.refresh}
          />
        );
      // Step 2 — connection is fine, the terminal itself is not registered.
      return (
        <TerminalActivation
          onActivated={() => {
            clearRevocation();
            startup.refresh();
          }}
        />
      );
    }
  }
  if (!user)
    return (
      <>
        <CloudSetupGate />
        {startup.offlineGrace && (
          <div className="bg-warning/15 px-3 py-1.5 text-center text-xs text-warning">
            Offline mode — this terminal is registered and keeps working locally.
          </div>
        )}
        <TerminalLogin />
      </>
    );
  if (!dataReady && !offlineBypass)
    return <TillLoader onContinueOffline={() => setOfflineBypass(true)} />;
  // Nothing can be sold, received or moved without somewhere to book it to.
  if (!stores.length && !location.pathname.startsWith("/stores")) return <LocationBootGuard />;

  // Anything that needs a hand here: goods on their way in, or notes this
  // branch still has to authorise or send.
  const inbound = (state.transfers ?? []).filter(
    (t) =>
      (t.toStoreId === currentStore?.id && t.status === "dispatched") ||
      (t.fromStoreId === currentStore?.id &&
        (t.status === "awaiting_approval" || t.status === "approved")),
  ).length;


  // Receipt identity wins; the locally captured install name is the fallback.
  const companyName = state.settings.receipt.companyName?.trim() || branding.company;

  // The sidebar and the route guard below run exactly the same test, so a link
  // that is shown always opens, and a link that is hidden cannot be reached by
  // typing its address either.
  const canSee = (item: NavItem) => {
    if (item.desktopHidden && isDesktop()) return false;
    if (item.flag && !can(item.flag)) return false;
    if (item.adminOnly && !isAdmin && !item.flag) return false;
    return visibleRoute(item.to);
  };


  const Brand = ({ mini }: { mini?: boolean }) => (
    <div className={cn("flex items-center gap-2 px-3 py-4", mini && "justify-center px-0")}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ReceiptText className="size-5" />
      </div>
      {!mini && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{companyName}</p>
          <p className="text-[11px] text-muted-foreground">{branding.terminal}</p>
        </div>
      )}
    </div>
  );

  // An admin on the phone browses every branch even though the device itself
  // is registered to one.
  const mayPickStore = canSwitchStores || (isNative() && isAdmin);

  const StorePicker = () =>
    mayPickStore ? (
      <Select value={currentStore.id} onValueChange={setCurrentStore}>
        <SelectTrigger className="h-9 w-full text-xs">
          <Store className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              {s.code} · {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-2 text-xs">
        <Store className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {currentStore.code} · {currentStore.name}
        </span>
      </div>
    );

  const Footer = ({ mini }: { mini?: boolean }) =>
    mini ? (
      <div className="px-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-center px-0"
          onClick={logout}
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    ) : (
      <div className="space-y-2 px-3 pb-2">
        <Badge
          variant="outline"
          className={
            activeShift
              ? "w-full justify-center border-success/40 bg-success/10 text-success"
              : "w-full justify-center border-destructive/40 bg-destructive/10 text-destructive"
          }
        >
          {activeShift ? `Shift open · ${activeShift.cashier}` : "Shift closed"}
        </Badge>
        <div className="rounded-md border border-border px-2 py-2">
          <p className="truncate text-xs font-medium">{user.name}</p>
          <p className="text-[11px] capitalize text-muted-foreground">{user.role}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 w-full justify-start px-1 text-xs"
            onClick={logout}
          >
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>
      </div>
    );

  return (
    <div className="pos-scaled flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <DbConnectionModal />
      <CloudSetupGate />
      {/* Frameless desktop shell: draggable strip under the native window buttons. */}
      {isDesktop() && (
        <div className="app-drag flex h-[34px] shrink-0 items-center gap-2 border-b border-border bg-sidebar pl-3">
          <ReceiptText className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-[11px] font-semibold text-muted-foreground">
            {companyName}
          </span>
          <WindowControls />
        </div>
      )}
      <ShiftGuard>
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Desktop / tablet sidebar */}
          <aside
            className={cn(
              "hidden shrink-0 flex-col border-r border-border bg-sidebar md:flex",
              collapsed ? "w-16" : "w-60",
            )}
          >
            <SidebarNav
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed(!collapsed)}
              canSee={canSee}
              inbound={inbound}
              header={
                <>
                  <Brand mini={collapsed} />
                  {!collapsed && <div className="px-3 pb-3">{<StorePicker />}</div>}
                </>
              }
              footer={<div className="mt-auto">{<Footer mini={collapsed} />}</div>}
            />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Mobile top bar + slide-out drawer */}
            <header className="pt-safe sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3 pb-2 md:hidden">
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open menu"
                    className="touch-target"
                  >
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="pt-safe pb-safe z-50 w-72 bg-sidebar p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SidebarNav
                    canSee={canSee}
                    inbound={inbound}
                    onNavigate={() => setDrawerOpen(false)}
                    header={
                      <>
                        <Brand />
                        <div className="px-3 pb-3">
                          <StorePicker />
                        </div>
                      </>
                    }
                    footer={<div className="mt-auto">{<Footer />}</div>}
                  />
                </SheetContent>
              </Sheet>
              <div className="flex min-w-0 items-center gap-2">
                <ReceiptText className="size-4 shrink-0 text-primary" />
                <span className="truncate text-sm font-semibold">{companyName}</span>
              </div>
              {/* The branch picker lives in the side menu only; the top bar
                  just states which branch is in use. */}
              <Badge
                variant="outline"
                className={cn(
                  "ml-auto shrink-0 text-[10px]",
                  activeShift
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                {currentStore.code}
              </Badge>
              {/* Narrow phones only get the essentials; the rest lives in the sheet. */}
              <span className="hidden sm:inline-flex">
                <LiveClock compact />
              </span>
              <MobileStatusSheet />
              <UpdateHeaderButton />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Settings"
              >
                <Link to="/settings">
                  <SettingsIcon className="size-4" />
                </Link>
              </Button>
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                className="touch-target shrink-0 px-2 text-[11px]"
                onClick={() => void lock()}
              >
                <Lock className="size-3.5" /> Lock
              </Button>
            </header>

            {/* Desktop header: signed-in cashier + quick lock / switch user */}
            <header className="sticky top-0 z-30 hidden shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-2 md:flex">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {user.staffId} · {user.role}
                </p>
              </div>
              <div className="ml-auto" />
              <LiveClock />
              <ConnectionStatusButton />
              <SystemAlertsButton />
              <ActivityBell />

              {terminal.config && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-primary/40 bg-primary/10 text-[11px] text-primary"
                >
                  <MapPin className="size-3" />
                  {terminal.config.locationName || currentStore.name}
                </Badge>
              )}
              <UpdateHeaderButton />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Settings"
              >
                <Link to="/settings">
                  <SettingsIcon className="size-4" />
                </Link>
              </Button>
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void lock()}
              >
                <Lock className="size-3.5" /> Lock / Switch user
              </Button>
            </header>

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              {(() => {
                // Decided before the page body renders: no flash of protected data.
                if (isDesktop() && isDesktopBlocked(location.pathname))
                  return (
                    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
                      <Lock className="size-8 text-muted-foreground" />
                      <h1 className="text-lg font-semibold">Managed in the web console</h1>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        Accounts, branches, messaging credentials and device activation are handled
                        centrally, not from a till. Open the web admin console to change them.
                      </p>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/">Back to the register</Link>
                      </Button>
                    </div>
                  );
                const required = requiredPermission(location.pathname);
                const allowed =
                  required === null ? true : required === "unknown" ? isAdmin : can(required);
                if (allowed && visibleRoute(location.pathname)) return children;
                if (allowed) return <PermissionDenied title="Hidden for your role" flag={null} />;
                return <PermissionDenied flag={required === "unknown" ? null : required} />;
              })()}
            </main>
          </div>
        </div>
      </ShiftGuard>
    </div>
  );
}
