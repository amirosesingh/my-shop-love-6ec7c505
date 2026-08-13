/**
 * Register action registry.
 *
 * Every page, modal and till action an admin can bind to a button lives here.
 * The register route registers its handlers once with the provider, so the
 * feature (and its hotkey) stays alive even when no button is placed on the
 * canvas — removing a button only removes a visual node, never the behaviour.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

export type ActionCategory =
  | "Sales & register"
  | "Tickets & bookings"
  | "Operations & shift"
  | "Stakeholders"
  | "Inventory & products";

export type ActionDef = {
  id: string;
  label: string;
  category: ActionCategory;
  /** Page targets navigate; the rest are handled by the register route. */
  to?: string;
  /** Optional keyboard shortcut registered globally by the provider. */
  hotkey?: string;
};

export const REGISTER_ACTIONS: ActionDef[] = [
  // Sales & register
  { id: "cart.focus", label: "Current cart", category: "Sales & register" },
  { id: "cart.barcode", label: "Barcode lookup", category: "Sales & register", hotkey: "F2" },
  { id: "cart.fastCash", label: "Fast cash pad", category: "Sales & register" },
  { id: "cart.receipt", label: "Live receipt", category: "Sales & register" },
  { id: "cart.charge", label: "Charge / take payment", category: "Sales & register", hotkey: "F4" },
  { id: "cart.clear", label: "Clear bill", category: "Sales & register" },
  { id: "cart.coupon", label: "Apply coupon", category: "Sales & register" },
  { id: "cart.split", label: "Split bill", category: "Sales & register" },

  // Tickets & bookings
  { id: "book.hub", label: "Manage Booking", category: "Tickets & bookings" },
  { id: "book.manage", label: "Bookings management", category: "Tickets & bookings", to: "/bookings" },
  { id: "hold.new", label: "Hold / park this order", category: "Tickets & bookings", hotkey: "F6" },
  { id: "hold.list", label: "Held orders list", category: "Tickets & bookings", to: "/holds", hotkey: "F7" },
  { id: "void.log", label: "Voided tickets log", category: "Tickets & bookings", to: "/reports/voids" },
  { id: "void.cart", label: "Void current bill", category: "Tickets & bookings" },

  // Operations & shift
  { id: "shift.close", label: "Close shift", category: "Operations & shift", to: "/shifts", hotkey: "F9" },
  { id: "shift.open", label: "Open shift", category: "Operations & shift" },
  { id: "shift.staff", label: "Staff clock in / out", category: "Operations & shift", to: "/shifts" },
  { id: "display.toggle", label: "Customer display screen", category: "Operations & shift", to: "/display" },
  { id: "drawer.open", label: "Cash drawer eject", category: "Operations & shift", hotkey: "F8" },
  { id: "receipt.reprint", label: "Reprint last receipt", category: "Operations & shift" },
  { id: "receipt.history", label: "Receipt history", category: "Operations & shift", to: "/receipts" },

  // Stakeholders
  { id: "member.search", label: "Customer search / directory", category: "Stakeholders", to: "/members", hotkey: "F3" },
  { id: "member.add", label: "Add new customer", category: "Stakeholders" },
  { id: "supplier.page", label: "Supplier management", category: "Stakeholders", to: "/suppliers" },
  { id: "customers.page", label: "Customers page", category: "Stakeholders", to: "/customers" },

  // Inventory & products
  { id: "product.search", label: "Product search", category: "Inventory & products", hotkey: "F1" },
  { id: "stock.adjust", label: "Stock adjustment", category: "Inventory & products", to: "/inventory" },
  { id: "stock.transfers", label: "Stock transfers", category: "Inventory & products", to: "/transfers" },
  { id: "exchange.open", label: "Exchange / returns", category: "Inventory & products" },
];

export const ACTION_CATEGORIES: ActionCategory[] = [
  "Sales & register",
  "Tickets & bookings",
  "Operations & shift",
  "Stakeholders",
  "Inventory & products",
];

export const ACTION_BY_ID: Record<string, ActionDef> = REGISTER_ACTIONS.reduce(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {} as Record<string, ActionDef>,
);

export const isActionId = (v: string) => v in ACTION_BY_ID;

export type ActionHandlers = Record<string, (() => void) | undefined>;

type Ctx = { run: (id: string) => void; can: (id: string) => boolean };

const ActionsContext = createContext<Ctx>({ run: () => {}, can: () => false });

/**
 * Holds every till handler at the register root. Handlers are kept in a ref so
 * re-renders never re-register the single global hotkey listener.
 */
export function RegisterActionsProvider({
  handlers,
  children,
}: {
  handlers: ActionHandlers;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const ref = useRef(handlers);
  ref.current = handlers;

  const run = useCallback(
    (id: string) => {
      const local = ref.current[id];
      if (local) {
        local();
        return;
      }
      const def = ACTION_BY_ID[id];
      if (def?.to) void navigate({ to: def.to });
    },
    [navigate],
  );

  const can = useCallback((id: string) => !!ref.current[id] || !!ACTION_BY_ID[id]?.to, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const hit = REGISTER_ACTIONS.find((a) => a.hotkey && a.hotkey === e.key);
      if (!hit) return;
      e.preventDefault();
      run(hit.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  const value = useMemo<Ctx>(() => ({ run, can }), [run, can]);
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

export const useRegisterActions = () => useContext(ActionsContext);