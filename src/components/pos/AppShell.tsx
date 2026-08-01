import { LogOut, Menu, ReceiptText, Store } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { LoginScreen } from "@/components/pos/LoginScreen";
import { SidebarNav, useSidebarCollapsed } from "@/components/pos/SidebarNav";
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

export function AppShell({ children }: { children: ReactNode }) {
  const { activeShift, stores, currentStore, setCurrentStore, state } = usePos();
  const { ready, user, isAdmin, logout, can } = useAuth();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setPrintStore(currentStore ?? null);
  }, [currentStore]);

  useEffect(() => {
    setPrintSettings(state.settings.receipt, state.settings.tax);
  }, [state.settings]);

  // Cashiers are pinned to their assigned branch — no manual switching.
  useEffect(() => {
    if (user && !isAdmin && user.storeId && currentStore.id !== user.storeId) {
      setCurrentStore(user.storeId);
    }
  }, [user, isAdmin, currentStore.id, setCurrentStore]);

  if (!ready) return null;
  if (!user) return <LoginScreen />;

  const inbound = state.transfers.filter(
    (t) =>
      (t.toStoreId === currentStore.id && t.status === "in_transit") ||
      (t.fromStoreId === currentStore.id && t.status === "requested"),
  ).length;

  const canSee = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.flag && !can(item.flag)) return false;
    return true;
  };

  const Brand = ({ mini }: { mini?: boolean }) => (
    <div className={cn("flex items-center gap-2 px-3 py-4", mini && "justify-center px-0")}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ReceiptText className="size-5" />
      </div>
      {!mini && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Northwind</p>
          <p className="text-[11px] text-muted-foreground">POS Terminal 01</p>
        </div>
      )}
    </div>
  );

  const StorePicker = () =>
    isAdmin ? (
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
    <div className="flex min-h-screen bg-background text-foreground">
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
            <span className="truncate text-sm font-semibold">Northwind POS</span>
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
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
