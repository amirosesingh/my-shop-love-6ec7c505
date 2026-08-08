import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const scopeEnum = z.enum(["GLOBAL", "CLUSTER", "BRANCH"]);
const settingValue = z.union([z.string().max(500), z.number(), z.boolean()]);

const readInput = z.object({
  accessToken: z.string().min(10),
  scope: scopeEnum,
  scopeId: z.string().max(120).default(""),
});

const upsertInput = z.object({
  accessToken: z.string().min(10),
  scope: scopeEnum,
  scopeId: z.string().max(120).default(""),
  patch: z.record(
    z.string().max(64),
    z.object({ value: settingValue.nullable().optional(), isOverridden: z.boolean() }),
  ),
});

const batchInput = z.object({
  accessToken: z.string().min(10),
  scope: z.enum(["GLOBAL", "CLUSTER"]),
  scopeId: z.string().max(120).default(""),
  keys: z.array(z.string().max(64)).max(200).default([]),
});

/** GET /api/settings — effective values plus inheritance metadata. */
export const getScopedSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => readInput.parse(data))
  .handler(async ({ data }) => {
    const { verifyPosStaff } = await import("./secure-settings.server");
    const { readScopedSettings } = await import("./settings-scope.server");
    try {
      await verifyPosStaff(data.accessToken);
      const res = await readScopedSettings(data.scope, data.scopeId, data.accessToken);
      return { ok: true as const, ...res };
    } catch (e) {
      return { ok: false as const, settings: [], error: (e as Error).message };
    }
  });

/** PUT /api/settings/upsert — write or clear overrides for one scope. */
export const upsertScopedSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertInput.parse(data))
  .handler(async ({ data }) => {
    const { verifyPosStaff } = await import("./secure-settings.server");
    const { writeScopedSettings, writeScopedSettingsWithService } = await import(
      "./settings-scope.server"
    );
    try {
      const caller = await verifyPosStaff(data.accessToken);
      if (!caller.isAdmin) return { ok: false as const, settings: [], error: "Supervisors only" };
      let settings;
      try {
        settings = await writeScopedSettings(
          data.scope,
          data.scopeId,
          data.patch,
          data.accessToken,
        );
      } catch {
        // The routine refused this session (or is not granted yet): the caller
        // is already proved to be a supervisor, so write with server rights.
        settings = await writeScopedSettingsWithService(data.scope, data.scopeId, data.patch);
      }
      return { ok: true as const, settings };
    } catch (e) {
      return { ok: false as const, settings: [], error: (e as Error).message };
    }
  });

/** POST /api/settings/sync-batch — push a scope's values to its child branches. */
export const syncSettingsBatch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => batchInput.parse(data))
  .handler(async ({ data }) => {
    const { verifyPosStaff } = await import("./secure-settings.server");
    const { pushScopedSettings } = await import("./settings-scope.server");
    try {
      const caller = await verifyPosStaff(data.accessToken);
      if (!caller.isAdmin) return { ok: false as const, error: "Supervisors only" };
      const result = await pushScopedSettings(
        data.scope,
        data.scopeId,
        data.keys,
        data.accessToken,
      );
      return { ok: true as const, result };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });