import { Link } from "@tanstack/react-router";
import { Boxes, Clock, ReceiptText, Users, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";
import { usePos } from "@/lib/pos-store";
import { Badge } from "@/components/ui/badge";

const nav = [
  { to: "/", label: "Register", icon: LayoutGrid },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/members", label: "Members", icon: Users },
  { to: "/shifts", label: "Shifts", icon: Clock },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { activeShift } = usePos();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-20 shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-4 md:w-56 md:items-stretch md:px-3">
        <div className="mb-4 flex items-center gap-2 px-1 md:px-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold leading-tight">Northwind</p>
            <p className="text-[11px] text-muted-foreground">POS Terminal 01</p>
          </div>
        </div>

        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            activeProps={{ className: "bg-sidebar-accent text-primary" }}
            className="flex flex-col items-center gap-1 rounded-md px-2 py-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground md:flex-row md:gap-3 md:text-sm"
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
          </Link>
        ))}

        <div className="mt-auto hidden px-2 md:block">
          <Badge
            variant="outline"
            className={
              activeShift
                ? "w-full justify-center border-success/40 bg-success/10 text-success"
                : "w-full justify-center border-border text-muted-foreground"
            }
          >
            {activeShift ? `Shift open · ${activeShift.cashier}` : "Shift closed"}
          </Badge>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}