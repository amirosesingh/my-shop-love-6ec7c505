/**
 * The "sending on WhatsApp" state machine, in one place.
 *
 * The register turns a sending flag on, hands the message off, and turns the
 * flag off again. Previously the flag was cleared only on the happy path, so a
 * thrown send (no network, bad token, logging failure) left the till showing
 * "sending" for the rest of the session — and, because the automatic send is
 * fire-and-forget, the failure escaped as an unhandled rejection.
 *
 * Here the flag is cleared in every outcome and every failure becomes a toast,
 * so the caller can keep using `void` without risk.
 */
import { toast } from "sonner";

import { describeError } from "@/lib/notify";

export type WhatsAppSendResult = { ok: boolean; error?: string };

export async function runWhatsAppSend(
  setSending: (v: boolean) => void,
  send: () => Promise<WhatsAppSendResult>,
  successMessage: string,
): Promise<void> {
  setSending(true);
  try {
    const res = await send();
    if (res.ok) toast.success(successMessage);
    else toast.error("WhatsApp send failed", { description: res.error });
  } catch (error) {
    toast.error("WhatsApp send failed", { description: describeError(error, "The send") });
  } finally {
    setSending(false);
  }
}
