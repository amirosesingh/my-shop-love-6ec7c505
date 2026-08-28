/**
 * The one prompt shown when an action needs authorising.
 *
 * Depending on the branch rule it offers a PIN (someone with the right to
 * approve is standing there), an approval request (nobody is), or both. The
 * PIN itself is only ever checked inside the database.
 */
import { useEffect, useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyError } from "@/lib/notify";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";
import {
  authorizeWithPin,
  submitAuthorizationRequest,
} from "@/lib/authorization.functions";
import type { AuthMode, AuthPayload } from "@/lib/authorization";

export type AuthorizationPrompt = {
  actionKey: string;
  mode: Exclude<AuthMode, "none">;
  title: string;
  reason: string;
  requireReason: boolean;
  storeId?: string | null;
  terminalId?: string | null;
  payload?: AuthPayload;
};

export type PromptOutcome =
  | { kind: "approved"; grantToken: string; by: string }
  | { kind: "submitted"; requestId: string }
  | { kind: "cancelled" };

export function AuthorizationDialog({
  prompt,
  onFinish,
}: {
  prompt: AuthorizationPrompt | null;
  onFinish: (outcome: PromptOutcome) => void;
}) {
  const [tab, setTab] = useState<"pin" | "request">("pin");
  const [authorizerId, setAuthorizerId] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!prompt) return;
    setTab(prompt.mode === "request" ? "request" : "pin");
    setAuthorizerId("");
    setPin("");
    setNote("");
  }, [prompt]);

  async function submitPin() {
    if (!prompt) return;
    setBusy(true);
    try {
      const auth = await getPosCallerAuth();
      const res = await authorizeWithPin({
        data: {
          ...auth,
          actionKey: prompt.actionKey,
          authorizerId: authorizerId.trim(),
          pin,
          ...(prompt.storeId ? { storeId: prompt.storeId } : {}),
          ...(prompt.terminalId ? { terminalId: prompt.terminalId } : {}),
          ...(note.trim() ? { reason: note.trim() } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Authorisation failed");
        return;
      }
      if (res.warning) toast.warning(res.warning);
      toast.success(`Approved by ${res.authorizer.name}`);
      onFinish({ kind: "approved", grantToken: res.grantToken, by: res.authorizer.name });
    } catch (e) {
      notifyError(e, "Authorisation failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest() {
    if (!prompt) return;
    setBusy(true);
    try {
      const auth = await getPosCallerAuth();
      const res = await submitAuthorizationRequest({
        data: {
          ...auth,
          actionKey: prompt.actionKey,
          reason: note.trim(),
          payload: prompt.payload ?? {},
          ...(prompt.storeId ? { storeId: prompt.storeId } : {}),
          ...(prompt.terminalId ? { terminalId: prompt.terminalId } : {}),
        },
      });
      if (!res.ok || !res.request) {
        toast.error(res.error ?? "Could not send the request");
        return;
      }
      toast.success("Sent for approval", {
        description: "You will be able to continue once it is approved.",
      });
      onFinish({ kind: "submitted", requestId: res.request.id });
    } catch (e) {
      notifyError(e, "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  const reasonMissing = prompt?.requireReason && !note.trim();

  const pinPane = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Authoriser ID</Label>
        <Input
          name="authorizer-id"
          autoComplete="off"
          autoFocus
          value={authorizerId}
          onChange={(e) => setAuthorizerId(e.target.value)}
          placeholder="e.g. manager1"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">PIN</Label>
        <Input
          name="authorizer-pin"
          autoComplete="one-time-code"
          className="numeric"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !reasonMissing) void submitPin();
          }}
        />
      </div>
    </div>
  );

  const requestPane = (
    <p className="text-sm text-muted-foreground">
      This will wait in the approvals queue until someone allowed to decide it
      approves or rejects it. Nothing happens to the sale until then.
    </p>
  );

  return (
    <Dialog open={!!prompt} onOpenChange={(o) => !o && onFinish({ kind: "cancelled" })}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> {prompt?.title ?? "Authorisation"}
          </DialogTitle>
          <DialogDescription>{prompt?.reason}</DialogDescription>
        </DialogHeader>

        {prompt?.mode === "either" ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "pin" | "request")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pin">Enter a PIN</TabsTrigger>
              <TabsTrigger value="request">Send for approval</TabsTrigger>
            </TabsList>
            <TabsContent value="pin" className="pt-3">
              {pinPane}
            </TabsContent>
            <TabsContent value="request" className="pt-3">
              {requestPane}
            </TabsContent>
          </Tabs>
        ) : prompt?.mode === "request" ? (
          requestPane
        ) : (
          pinPane
        )}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Reason {prompt?.requireReason ? "(required)" : "(optional)"}
          </Label>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 400))}
            placeholder="Why is this needed?"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onFinish({ kind: "cancelled" })} disabled={busy}>
            Cancel
          </Button>
          {tab === "request" || prompt?.mode === "request" ? (
            <Button onClick={() => void submitRequest()} disabled={busy || !!reasonMissing}>
              <Send className="mr-1 size-4" />
              {busy ? "Sending…" : "Send for approval"}
            </Button>
          ) : (
            <Button
              onClick={() => void submitPin()}
              disabled={busy || pin.length < 4 || !authorizerId.trim() || !!reasonMissing}
            >
              {busy ? "Checking…" : "Authorise"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
