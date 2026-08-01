import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/pos-auth";
import {
  PERMISSION_LABELS,
  resolvePermission,
  type PermissionFlag,
  type StaffPermissions,
} from "@/lib/permissions";

const sb = supabaseExternal as unknown as SupabaseClient;

type Ctx = {
  permissions: StaffPermissions;
  /** app_users row for the signed-in account (via rpc current_app_user). */
  appUser: ReturnType<typeof useAuth>["appUser"];
  role: string | null;
  hasPermission: (flag: PermissionFlag | string) => boolean;
  /**
   * Resolves true when the user already holds the permission, or after a
   * supervisor authorises the action with their User ID + PIN.
   */
  requirePermission: (flag: PermissionFlag | string) => Promise<boolean>;
};

const PermissionsContext = createContext<Ctx | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, can, appUser } = useAuth();
  const [pending, setPending] = useState<PermissionFlag | null>(null);
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const permissions = (user?.permissions ?? {}) as StaffPermissions;

  const hasPermission = useCallback(
    (flag: PermissionFlag | string) => can(flag as PermissionFlag),
    [can],
  );

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
    setUserId("");
    setPin("");
    setError("");
  };

  const requirePermission = useCallback(
    (flag: PermissionFlag | string) =>
      new Promise<boolean>((resolve) => {
        if (can(flag as PermissionFlag)) {
          resolve(true);
          return;
        }
        resolver.current = resolve;
        setError("");
        setPending(flag as PermissionFlag);
      }),
    [can],
  );

  const verify = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter the supervisor 4-digit PIN");
      return;
    }
    setBusy(true);
    const { data, error: rpcError } = await sb.rpc("verify_terminal_pin", {
      p_user_id: userId.trim(),
      p_pin: pin,
    });
    setBusy(false);
    const row = (Array.isArray(data) ? data[0] : data) as { role?: string } | undefined;
    if (rpcError || !row) {
      setError("Invalid supervisor User ID or PIN");
      return;
    }
    if (row.role !== "admin" && row.role !== "manager") {
      setError("That account is not a supervisor");
      return;
    }
    close(true);
  };

  const value = useMemo<Ctx>(
    () => ({
      permissions,
      appUser,
      role: appUser?.role ?? null,
      hasPermission,
      requirePermission,
    }),
    [permissions, appUser, hasPermission, requirePermission],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
      <Dialog open={!!pending} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" /> Supervisor override
            </DialogTitle>
            <DialogDescription>
              Your account cannot{" "}
              {pending
                ? PERMISSION_LABELS[resolvePermission(pending)].toLowerCase()
                : "perform this action"}
              . A supervisor can authorise it now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ov-id">Supervisor User ID</Label>
              <Input id="ov-id" value={userId} onChange={(e) => setUserId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-pin">PIN</Label>
              <Input
                id="ov-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && void verify()}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button onClick={() => void verify()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Authorise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionsContext.Provider>
  );
}

export function useUserPermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("useUserPermissions must be used inside PermissionsProvider");
  return ctx;
}
