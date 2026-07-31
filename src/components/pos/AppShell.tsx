import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Boxes,
  Clock,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Store,
  Users,
  LayoutGrid,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { LoginScreen } from "@/components/pos/LoginScreen";
import { setPrintStore } from "@/lib/pos-print";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const nav = [
  { to: "/", label: "Register", icon: LayoutGrid },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/members", label: "Members", icon: Users },
  { to: "/shifts", label: "Shifts", icon: Clock },
];

const adminNav = [{ to: "/staff", label: "Staff", icon: ShieldCheck }];

export function AppShell({ children }: { children: ReactNode }) {
  const { activeShift, stores, currentStore, setCurrentStore, state } = usePos();
  const { ready, user, isAdmin, logout } = useAuth();

  useEffect(() => {
    setPrintStore(currentStore ?? null);
  }, [currentStore]);

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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-20 shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-4 md:w-56 md:items-stretch md:px-3">
        <div className="mb-3 flex items-center gap-2 px-1 md:px-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold leading-tight">Northwind</p>
            <p className="text-[11px] text-muted-foreground">POS Terminal 01</p>
          </div>
        </div>

        <div className="mb-3 hidden px-1 md:block">
          {isAdmin ? (
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
              <Store className="size-3.5 text-muted-foreground" />
              <span className="truncate">
                {currentStore.code} · {currentStore.name}
              </span>
            </div>
          )}
        </div>

        {(isAdmin ? [...nav, ...adminNav] : nav).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            activeProps={{ className: "bg-sidebar-accent text-primary" }}
            className="flex flex-col items-center gap-1 rounded-md px-2 py-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground md:flex-row md:gap-3 md:text-sm"
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
            {item.to === "/transfers" && inbound > 0 && (
              <Badge className="ml-auto h-5 min-w-5 justify-center px-1 text-[10px]">
                {inbound}
              </Badge>
            )}
          </Link>
        ))}

        <div className="mt-auto hidden space-y-2 px-2 md:block">
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
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
