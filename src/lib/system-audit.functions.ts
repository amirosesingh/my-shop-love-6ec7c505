import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const entryInput = z.object({
  actorId: z.string().max(120).nullish(),
  actorName: z.string().max(160).nullish(),
  actorRole: z.string().max(60).nullish(),
  actionType: z.string().min(1).max(80),
  entityAffected: z.string().max(120).nullish(),
  entityId: z.string().max(160).nullish(),
  oldValue: z.unknown().nullish(),
  newValue: z.unknown().nullish(),
  terminalId: z.string().max(120).nullish(),
  storeId: z.string().max(64).nullish(),
  note: z.string().max(400).nullish(),
});

export const recordSystemAudit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => entryInput.parse(input))
  .handler(async ({ data }) => {
    const { writeSystemAudit } = await import("./system-audit.server");
    await writeSystemAudit(data);
    return { ok: true as const };
  });

export const listSystemAudit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ accessToken: z.string().min(10), limit: z.number().int().min(1).max(1000).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifySupervisorToken } = await import("./system-audit-access.server");
    const ok = await verifySupervisorToken(data.accessToken);
    if (!ok) return { ok: false as const, error: "Supervisor access required", rows: [] };
    const { readSystemAudit } = await import("./system-audit.server");
    return { ok: true as const, rows: await readSystemAudit(data.limit ?? 200) };
  });
