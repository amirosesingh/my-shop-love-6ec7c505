import { Loader2, Lock, LogOut, Menu, ReceiptText, Store } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePos } from "@/lib/pos-store";
import { useAuth, type PermissionFlag } from "@/lib/pos-auth";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { TerminalLogin } from "@/components/pos/TerminalLogin";
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

/** Screens reserved for supervisor / admin accounts, and the permission
 *  toggle that also unlocks them for any other account (e.g. warehouse). */
const ADMIN_PATHS: Record<string, PermissionFlag> = {
  "/settings": "can_access_pos_settings",
  "/staff": "can_manage_staff",
  "/stores": "can_view_inventory",
  "/promotions": "can_access_pos_settings",
  "/audit": "can_view_sales_reports",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { activeShift, stores, currentStore, setCurrentStore, state, ready: dataReady } = usePos();
  const { ready, user, isAdmin, canSwitchStores, logout, lock, can } = useAuth();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Terminal-wide font / control scaling preference.
  useUiScale();

  // Background outbox drain: keeps offline sales flowing once the link returns.
  useEffect(() => startSyncEngine(), []);

  // Cashier accounts are limited to the register; management screens are
  // reserved for supervisors and admins.
  useEffect(() => {
    // Settings has child pages (/settings/tax …) that inherit the same gate.
    const key =
      Object.keys(ADMIN_PATHS).find(
        (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
      ) ?? "";
    const required = ADMIN_PATHS[key];
    if (user && !isAdmin && required && !can(required)) {
      void navigate({ to: "/", replace: true });
    }
  }, [user, isAdmin, can, location.pathname, navigate]);

  useEffect(() => {
    setPrintStore(currentStore ?? null);
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

  const canSee = (item: NavItem) => {
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
    <div className="pos-scaled flex min-h-screen bg-background text-foreground">
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar + slide-out drawer */}
        <header className="flex items-center gap-2 border-b border-border bg-sidebar px-3 py-2 md:hidden">
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
        <header className="hidden items-center gap-3 border-b border-border bg-sidebar px-4 py-2 md:flex">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-[11px] capitalize text-muted-foreground">
              {user.staffId} · {user.role}
            </p>
          </div>
          <SyncStatus className="ml-auto" />
          <ThemeToggle />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void lock()}>
            <Lock className="size-3.5" /> Lock / Switch user
          </Button>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
