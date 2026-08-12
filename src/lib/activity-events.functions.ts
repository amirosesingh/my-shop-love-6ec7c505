import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const eventInput = z.object({
  type: z.string().min(1).max(60),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  title: z.string().min(1).max(200),
  message: z.string().max(1000).optional(),
  actorId: z.string().max(120).nullish(),
  actorName: z.string().max(160).nullish(),
  actorRole: z.string().max(60).nullish(),
  terminalId: z.string().max(120).nullish(),
  terminalName: z.string().max(160).nullish(),
  storeId: z.string().max(64).nullish(),
  entityType: z.string().max(60).nullish(),
  entityId: z.string().max(160).nullish(),
  amount: z.number().finite().nullish(),
  meta: z.record(z.string(), z.unknown()).optional(),
  clientEventId: z.string().max(80).optional(),
  createdAt: z.string().max(40).optional(),
});

export const pushActivityEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => eventInput.parse(input))
  .handler(async ({ data }) => {
    const { writeActivityEvent } = await import("./activity-events.server");
    const res = await writeActivityEvent({
      event_type: data.type,
      severity: data.severity,
      title: data.title,
      message: data.message ?? "",
      actor_id: data.actorId ?? null,
      actor_name: data.actorName ?? null,
      actor_role: data.actorRole ?? null,
      terminal_id: data.terminalId ?? null,
      terminal_name: data.terminalName ?? null,
      store_id: data.storeId ?? null,
      entity_type: data.entityType ?? null,
      entity_id: data.entityId ?? null,
      amount: data.amount ?? null,
      meta: (data.meta ?? {}) as Record<string, unknown>,
      client_event_id: data.clientEventId ?? null,
      created_at: data.createdAt ?? new Date().toISOString(),
    });
    return res;
  });

const settingsInput = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().max(30)).max(20),
  criticalOnly: z.boolean(),
  quietFrom: z.string().max(5),
  quietTo: z.string().max(5),
  channels: z.record(z.string(), z.enum(["off", "app", "whatsapp"])),
});

export const loadNotificationSettings = createServerFn({ method: "POST" }).handler(async () => {
  const { readNotificationSettings } = await import("./activity-events.server");
  return await readNotificationSettings();
});

export const saveNotificationSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ accessToken: z.string().min(10), settings: settingsInput }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyPosStaff } = await import("./secure-settings.server");
    try {
      const staff = await verifyPosStaff(data.accessToken);
      if (staff.role !== "admin" && staff.role !== "manager") {
        return { ok: false as const, error: "Admin access required" };
      }
    } catch {
      return { ok: false as const, error: "Admin access required" };
    }
    const { writeNotificationSettings } = await import("./activity-events.server");
    try {
      await writeNotificationSettings(data.settings);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });