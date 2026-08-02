import { Loader2, Lock, LogOut, Menu, MapPin, ReceiptText, Store } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePos } from "@/lib/pos-store";
import { useAuth, type PermissionFlag } from "@/lib/pos-auth";
import { Link, useLocation } from "@tanstack/react-router";
import { TerminalLogin } from "@/components/pos/TerminalLogin";
import {
  TerminalActivation,
  TerminalRevokedScreen,
} from "@/components/pos/TerminalActivation";
import { clearRevocation, useRevocationCheck } from "@/lib/use-revocation-check";
import { SidebarNav, useSidebarCollapsed } from "@/components/pos/SidebarNav";
import { SyncStatus } from "@/components/pos/SyncStatus";
import { ThemeToggle } from "@/components/pos/ThemeToggle";
import { startSyncEngine } from "@/lib/sync-engine";
import type { NavItem } from "@/components/pos/nav-config";
import { setPrintStore, setPrintSettings } from "@/lib/pos-print";
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
import { setBranchId } from "@/lib/activity-journal";
import { flushWhatsAppQueue } from "@/lib/whatsapp";
import { reportAppReady } from "@/lib/app-health";

/** Permission required to open each screen. Keys are path prefixes, so child
 *  pages (/settings/tax, /reports/sales …) inherit the parent gate unless they
 *  declare their own. `/` (register) and `/display` are intentionally open to
 *  every signed-in account. Keep this in sync with nav-config.ts. */
const ROUTE_PERMISSIONS: Record<string, PermissionFlag> = {
  "/settings/terminals": "can_manage_terminals",
  "/settings/sync": "can_manage_sync_backup",
  "/settings": "can_access_pos_settings",
  "/staff": "can_manage_staff",
  "/stores": "can_manage_locations",
  "/promotions": "can_manage_promotions",
  "/audit": "can_view_audit_trail",
  "/dashboard": "can_view_dashboard",
  "/reports/activity": "can_view_audit_trail",
  "/reports": "can_view_sales_reports",
  "/receipts": "can_view_sales_reports",
  "/shifts": "can_close_shift",
  "/inventory": "can_view_inventory",
  "/purchasing": "can_receive_purchase_order",
  "/transfers": "can_create_transfer",
  "/bookings": "can_manage_bookings",
  "/members": "can_add_member",
};

/** The only screens any signed-in account may open. Everything else must have
 *  an entry above — unknown paths are denied, never silently allowed. */
const PUBLIC_ROUTES = new Set(["/", "/display"]);

/** Cloud-only admin tools. The Windows till never manages accounts, branches,
 *  messaging credentials or device activation — those stay in the web console. */
const DESKTOP_BLOCKED = ["/settings/terminals", "/settings/whatsapp", "/staff", "/stores"];

const isDesktopBlocked = (pathname: string) =>
  DESKTOP_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Longest matching prefix wins so a child page can tighten its parent gate. */
function requiredPermission(pathname: string): PermissionFlag | null | "unknown" {
  if (PUBLIC_ROUTES.has(pathname)) return null;
  const key =
    Object.keys(ROUTE_PERMISSIONS)
      .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
      .sort((a, b) => b.length - a.length)[0] ?? "";
  return ROUTE_PERMISSIONS[key] ?? "unknown";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { activeShift, stores, currentStore, setCurrentStore, state, ready: dataReady } = usePos();
  const { ready, user, isAdmin, canSwitchStores, logout, lock, can } = useAuth();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const branding = useBranding();
  // Windows tills must be registered to a location before they can be used.
  const terminal = useRevocationCheck();
  const location = useLocation();

  // Terminal-wide font / control scaling preference.
  useUiScale();

  // Background outbox drain: keeps offline sales flowing once the link returns.
  useEffect(() => startSyncEngine(), []);

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

  useEffect(() => {
    setPrintStore(currentStore ?? null);
  }, [currentStore]);

  // Stamp every journal entry and queued write with the branch in use.
  useEffect(() => {
    setBranchId(currentStore?.id ?? null);
  }, [currentStore]);

  useEffect(() => {
    setPrintSettings(state.settings.receipt, state.settings.tax);
  }, [state.settings]);

  // Anyone with a single assigned branch is pinned to it — no manual switching.
  useEffect(() => {
    if (user && !canSwitchStores && user.storeId && currentStore.id !== user.storeId) {
      setCurrentStore(user.storeId);
    }
  }, [user, canSwitchStores, currentStore.id, setCurrentStore]);

  if (!ready) return null;
  if (isDesktop()) {
    if (terminal.revoked) return <TerminalRevokedScreen onReactivate={clearRevocation} />;
    if (!terminal.config) return <TerminalActivation onActivated={() => clearRevocation()} />;
  }
  if (!user) return <TerminalLogin />;
  if (!dataReady)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading store data…</p>
      </div>
    );

  const inbound = state.transfers.filter(
    (t) =>
      (t.toStoreId === currentStore.id && t.status === "in_transit") ||
      (t.fromStoreId === currentStore.id && t.status === "requested"),
  ).length;

  // Receipt identity wins; the locally captured install name is the fallback.
  const companyName =
    state.settings.receipt.companyName?.trim() || branding.company;

  const canSee = (item: NavItem) => {
    if (item.desktopHidden && isDesktop()) return false;
    if (item.flag && !can(item.flag)) return false;
    if (item.adminOnly && !isAdmin && !item.flag) return false;
    return true;
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

  const StorePicker = () =>
    canSwitchStores ? (
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
    <div className="pos-scaled flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Frameless desktop shell: draggable strip under the native window buttons. */}
      {isDesktop() && (
        <div className="app-drag flex h-[34px] shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
          <ReceiptText className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-[11px] font-semibold text-muted-foreground">
            {companyName}
          </span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
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
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3 py-2 md:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
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
          <SyncStatus />
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2 text-[11px]"
            onClick={() => void lock()}
          >
            <Lock className="size-3.5" /> Lock
          </Button>
        </header>

        {/* Desktop header: signed-in cashier + quick lock / switch user */}
        <header className="hidden shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-2 md:flex">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-[11px] capitalize text-muted-foreground">
              {user.staffId} · {user.role}
            </p>
          </div>
          <SyncStatus className="ml-auto" />
          {terminal.config && (
            <Badge
              variant="outline"
              className="shrink-0 gap-1 border-primary/40 bg-primary/10 text-[11px] text-primary"
            >
              <MapPin className="size-3" />
              {terminal.config.locationName || currentStore.name}
            </Badge>
          )}
          <ThemeToggle />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void lock()}>
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
            if (allowed) return children;
            return (
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
                <Lock className="size-8 text-muted-foreground" />
                <h1 className="text-lg font-semibold">Access restricted</h1>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Your account does not have permission to open this screen. Ask an administrator to
                  enable it in Staff Management.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/">Back to the register</Link>
                </Button>
              </div>
            );
          })()}
        </main>
      </div>
      </div>
    </div>
  );
}
