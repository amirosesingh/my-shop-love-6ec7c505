/**
 * Activation attempts, written where an administrator can see them.
 *
 * A till that fails to activate has no database of its own yet, so the entry
 * is pushed straight to the tenant named inside the activation code, using the
 * same throwaway connection the claim already opened. It is also written to
 * the local activity trail so nothing is lost when the network drops.
 */
import { APP_VERSION } from "@/version";
import { logger } from "@/lib/audit-log";
import { isAndroid, isElectron, isNative } from "@/platform-config/platform";

export type ActivationOutcome =
  | "succeeded"
  | "already_claimed"
  | "expired"
  | "revoked"
  | "invalid_code"
  | "unreachable";

const OUTCOME_LABEL: Record<ActivationOutcome, string> = {
  succeeded: "Terminal activation succeeded",
  already_claimed: "Terminal activation blocked — code already claimed",
  expired: "Terminal activation blocked — code expired",
  revoked: "Terminal activation blocked — code revoked",
  invalid_code: "Terminal activation blocked — invalid code",
  unreachable: "Terminal activation failed — database unreachable",
};

/** Which shell attempted the activation. */
export function activationPlatform(): string {
  if (isElectron()) return "windows-desktop";
  if (isAndroid()) return "android";
  if (isNative()) return "mobile";
  return "browser";
}

function deviceName(): string {
  return typeof navigator === "undefined" ? "unknown device" : navigator.userAgent.slice(0, 160);
}

export type ActivationAttempt = {
  outcome: ActivationOutcome;
  terminalId: string | null;
  branchId?: string | null;
  branchName?: string | null;
  reason?: string;
};

type LooseClient = {
  from: (table: string) => {
    insert: (rows: unknown) => PromiseLike<{ error: { message: string } | null }>;
  };
};

/**
 * Record one attempt. Never throws: a failed log must not stop, or mask, an
 * activation.
 */
export async function recordActivationAttempt(
  tenant: unknown,
  attempt: ActivationAttempt,
): Promise<void> {
  const details = {
    outcome: attempt.outcome,
    terminalId: attempt.terminalId ?? null,
    branchId: attempt.branchId ?? null,
    branchName: attempt.branchName ?? null,
    devicePlatform: activationPlatform(),
    deviceName: deviceName(),
    appVersion: APP_VERSION,
    reason: attempt.reason ?? null,
    at: new Date().toISOString(),
  };

  try {
    logger.log("security", OUTCOME_LABEL[attempt.outcome], "Terminal activation", details);
  } catch {
    /* local trail unavailable (server render) */
  }

  if (!tenant) return;
  try {
    await (tenant as LooseClient).from("audit_logs").insert([
      {
        user_name: `Terminal ${attempt.terminalId ?? "unknown"}`,
        action_category: "Security & access",
        action_name: OUTCOME_LABEL[attempt.outcome],
        target_module: "Terminal activation",
        details,
        created_at: details.at,
      },
    ]);
  } catch {
    /* the tenant refused the write — the local trail still has it */
  }
}