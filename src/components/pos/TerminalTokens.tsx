/**
 * Admin console: issue an activation code for a Windows till and disconnect a
 * machine again at any time.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  ShieldX,
  Trash2,
} from "lucide-react";
import qrcode from "qrcode-generator";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { usePos } from "@/lib/pos-store";
import { logger } from "@/lib/audit-log";
import {
  ensureLocations,
  deleteTerminalToken,
  issueTerminalToken,
  listTerminalTokens,
  reissueTerminalToken,
  restoreTerminalToken,
  revokeTerminalToken,
  type TerminalToken,
} from "@/lib/terminal-tokens";

const qrDataUrl = (value: string) => {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  return qr.createDataURL(5, 8);
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export function TerminalTokens() {
  const { stores } = usePos();
  const [tokens, setTokens] = useState<TerminalToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locationId, setLocationId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<TerminalToken | null>(null);
  const [pendingReissue, setPendingReissue] = useState<TerminalToken | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TerminalToken | null>(null);
  const [reissuing, setReissuing] = useState("");
  const [reissued, setReissued] = useState<{ token: TerminalToken; code: string } | null>(null);
  const [reissueCopied, setReissueCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTokens(await listTerminalTokens());
      setError("");
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Could not load terminal tokens. Has schema10.sql been applied?",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!locationId && stores.length) setLocationId(stores[0].id);
  }, [stores, locationId]);

  // Mirror local locations into the central directory so the dropdown and the
  // database agree before any token references one of them.
  useEffect(() => {
    if (!stores.length) return;
    void ensureLocations(
      stores.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        address: s.address,
        phone: s.phone,
      })),
    ).catch(() => {
      /* non-fatal: issuing a token re-attempts this for the chosen location */
    });
  }, [stores]);

  const qr = useMemo(() => (code ? qrDataUrl(code) : ""), [code]);
  const reissueQr = useMemo(
    () => (reissued ? qrDataUrl(reissued.code) : ""),
    [reissued],
  );
  const locationName = useMemo(() => {
    const s = stores.find((x) => x.id === locationId);
    return s ? `${s.name} — ${s.code}` : "";
  }, [stores, locationId]);

  const generate = async () => {
    if (!locationId) return toast.error("Choose a location first");
    if (!deviceName.trim()) return toast.error("Enter a terminal / device name");
    const store = stores.find((x) => x.id === locationId);
    if (!store) return toast.error("That location is no longer available");
    setIssuing(true);
    try {
      const { code: issued } = await issueTerminalToken({
        location: {
          id: store.id,
          code: store.code,
          name: store.name,
          address: store.address,
          phone: store.phone,
        },
        locationName,
        deviceName: deviceName.trim(),
      });
      setCode(issued);
      setDeviceName("");
      logger.log("settings_change", "Terminal token issued", "terminals", {
        location: locationName,
        device: deviceName.trim(),
      });
      toast.success("Activation token generated");
      await refresh();
    } catch (e) {
      const message = (e as { message?: string })?.message ?? "Unknown error";
      toast.error("Could not generate the token", {
        description: /foreign key|location_id/i.test(message)
          ? `${message} — the selected location could not be saved to the central directory. Check that you are signed in with a staff account.`
          : message,
      });
    } finally {
      setIssuing(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const revoke = async (token: TerminalToken) => {
    try {
      await revokeTerminalToken(token.id);
      logger.log("settings_change", "Terminal token revoked", "terminals", {
        device: token.deviceName,
        location: token.locationName,
      });
      toast.success(`${token.deviceName} disconnected`);
      await refresh();
    } catch (e) {
      toast.error("Could not revoke the token", {
        description: (e as { message?: string })?.message,
      });
    }
  };

  const restore = async (token: TerminalToken) => {
    try {
      await restoreTerminalToken(token.id);
      toast.success(`${token.deviceName} re-enabled`);
      await refresh();
    } catch (e) {
      toast.error("Could not restore the token", {
        description: (e as { message?: string })?.message,
      });
    }
  };

  const remove = async (token: TerminalToken) => {
    try {
      await deleteTerminalToken(token.id);
      logger.log("settings_change", "Terminal entry deleted", "terminals", {
        device: token.deviceName,
        location: token.locationName,
      });
      toast.success(`${token.deviceName} removed`);
      await refresh();
    } catch (e) {
      toast.error("Could not delete the terminal", {
        description: (e as { message?: string })?.message,
      });
    }
  };

  const reissue = async (token: TerminalToken) => {
    setReissuing(token.id);
    try {
      const result = await reissueTerminalToken(token);
      setReissued(result);
      setReissueCopied(false);
      logger.log("settings_change", "Terminal token re-issued", "terminals", {
        device: token.deviceName,
        location: token.locationName,
      });
      toast.success(`New code issued for ${token.deviceName}`);
      await refresh();
    } catch (e) {
      toast.error("Could not re-issue the code", {
        description: (e as { message?: string })?.message,
      });
    } finally {
      setReissuing("");
    }
  };

  const copyReissued = async () => {
    if (!reissued) return;
    await navigator.clipboard.writeText(reissued.code);
    setReissueCopied(true);
    window.setTimeout(() => setReissueCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------ generator ----------------------- */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Register a new terminal</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Issue one code per counter. The till scans or pastes it once and is then locked to that
          location.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Location / warehouse</Label>
            <ThemedSelect
              ariaLabel="Location or warehouse"
              value={locationId}
              onChange={setLocationId}
              placeholder="Choose a location"
              options={stores.map((s) => ({ value: s.id, label: `${s.name} — ${s.code}` }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="device-name" className="text-[11px] text-muted-foreground">
              Terminal / device name
            </Label>
            <Input
              id="device-name"
              className="h-9"
              placeholder="Billing Counter 1"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>
          <Button
            className="h-9"
            disabled={issuing || !locationId || !deviceName.trim()}
            onClick={() => void generate()}
          >
            {issuing ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Generate activation token
          </Button>
        </div>

        {code && (
          <div className="mt-5 grid gap-4 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <img
              src={qr}
              alt="Activation code QR"
              className="mx-auto size-40 rounded-md bg-white p-2"
            />
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">
                Scan this on the till, or copy the block below. It is shown once — regenerate a new
                token if it gets lost.
              </p>
              <pre className="max-h-32 overflow-auto rounded-md border border-border bg-background p-2 text-[10px] leading-relaxed break-all whitespace-pre-wrap">
                {code}
              </pre>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void copy()}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy activation code"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------- tokens -------------------------- */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Registered terminals</h2>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void refresh()}>
            <RotateCcw className="size-3.5" /> Refresh
          </Button>
        </div>

        {error && <p className="px-5 py-4 text-sm text-destructive">{error}</p>}

        {reissued && (
          <div className="m-5 grid gap-4 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <img
              src={reissueQr}
              alt="Replacement activation code QR"
              className="mx-auto size-40 rounded-md bg-white p-2"
            />
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">
                Replacement code for <strong>{reissued.token.deviceName}</strong> at{" "}
                {reissued.token.locationName || "this location"}. The previous code no longer works.
              </p>
              <pre className="max-h-32 overflow-auto rounded-md border border-border bg-background p-2 text-[10px] leading-relaxed break-all whitespace-pre-wrap">
                {reissued.code}
              </pre>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void copyReissued()}
                >
                  {reissueCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {reissueCopied ? "Copied" : "Copy activation code"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setReissued(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading terminals…
          </div>
        ) : tokens.length === 0 && !error ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No terminals registered yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device name</TableHead>
                <TableHead>Location / warehouse</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Claimed by</TableHead>
                <TableHead>Date created</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Re-issued</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{t.deviceName}</TableCell>
                  <TableCell className="text-muted-foreground">{t.locationName || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        t.status === "active"
                          ? "border-success/40 bg-success/10 text-success"
                          : t.status === "used"
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-destructive/40 bg-destructive/10 text-destructive"
                      }
                    >
                      {t.status === "active" ? "Active" : t.status === "used" ? "In use" : "Revoked"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground">
                    {t.claimedByDevice ? t.claimedByDevice : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(t.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(t.lastSeenAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(t.reissuedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={reissuing === t.id || Boolean(t.replacedBy)}
                        onClick={() => setPendingReissue(t)}
                      >
                        {reissuing === t.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        Re-issue code
                      </Button>
                      {t.status === "active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingRevoke(t)}
                        >
                          <ShieldX className="size-3.5" /> Revoke authenticity
                        </Button>
                      ) : (
                        <>
                          {t.status === "used" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => setPendingRevoke(t)}
                            >
                              <ShieldX className="size-3.5" /> Revoke authenticity
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => void restore(t)}
                            >
                              <RotateCcw className="size-3.5" /> Re-enable
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => setPendingDelete(t)}
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <AlertDialog open={!!pendingRevoke} onOpenChange={(o) => !o && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to disconnect this terminal?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke?.deviceName} at {pendingRevoke?.locationName || "this location"} will
              be locked the next time it reaches the internet, and its cloud sync stops immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const token = pendingRevoke;
                setPendingRevoke(null);
                if (token) void revoke(token);
              }}
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingReissue} onOpenChange={(o) => !o && setPendingReissue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue a replacement code for this terminal?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingReissue?.deviceName} at {pendingReissue?.locationName || "this location"} keeps
              its place in this list. The current code stops working immediately and the till must be
              activated again with the new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const token = pendingReissue;
                setPendingReissue(null);
                if (token) void reissue(token);
              }}
            >
              Re-issue code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
