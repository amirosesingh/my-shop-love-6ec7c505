/**
 * Owner-facing emergency codes.
 *
 * The reveal never returns a terminal's secret — only the six digits that open
 * that till for the current minute — and every reveal is written to the audit
 * log. Only an administrator/owner account may call it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { EmergencyTerminal } from "./emergency-escrow.server";

const listInput = z.object({ accessToken: z.string().min(10) });

const revealInput = z.object({
  accessToken: z.string().min(10),
  tokenId: z.string().min(1).max(80),
});

const companyInput = z.object({
  accessToken: z.string().min(10),
  utcOffsetMinutes: z.number().int().min(-900).max(900),
});

async function requireOwner(accessToken: string): Promise<{ userId: string; role: string }> {
  const { verifyPosStaff } = await import("./secure-settings.server");
  const staff = await verifyPosStaff(accessToken);
  if (!staff.isAdmin) throw new Error("Only an owner or administrator may read emergency codes");
  return { userId: staff.userId, role: staff.role };
}

async function audit(userId: string, action: string, detail: Record<string, unknown>) {
  try {
    const { serviceRest } = await import("@/core/api/pos-relay.server");
    await serviceRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          action,
          action_category: "security",
          action_name: action,
          target_module: "emergency_codes",
          entity: "emergency_code",
          user_id: userId,
          details: detail,
          created_at: new Date().toISOString(),
        },
      ]),
    });
  } catch {
    /* the reveal itself must not fail because logging did */
  }
}

export const listEmergencyTerminalsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; terminals: EmergencyTerminal[] }> => {
    try {
      await requireOwner(data.accessToken);
      const { listEmergencyTerminals } = await import("./emergency-escrow.server");
      return { ok: true, terminals: await listEmergencyTerminals() };
    } catch (e) {
      return { ok: false, error: (e as Error).message, terminals: [] };
    }
  });

export const revealEmergencyCodeFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => revealInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: false; error: string }
      | { ok: true; code: string; fingerprint: string; expiresInSeconds: number }
    > => {
      try {
        const staff = await requireOwner(data.accessToken);
        const { revealCode } = await import("./emergency-escrow.server");
        const result = await revealCode(data.tokenId);
        if (result.ok) await audit(staff.userId, "emergency_code_revealed", { terminal: data.tokenId });
        return result;
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  );

export const revealCompanyEmergencyCodeFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => companyInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ ok: false; error: string } | { ok: true; code: string; expiresInSeconds: number }> => {
      try {
        const staff = await requireOwner(data.accessToken);
        const { revealCompanyCode } = await import("./emergency-escrow.server");
        const result = await revealCompanyCode(data.utcOffsetMinutes);
        await audit(staff.userId, "emergency_master_code_revealed", {});
        return { ok: true, ...result };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  );
