/**
 * Shared handler for the POS sync relay.
 *
 * Mounted at `/api/v1/pos/sync` (canonical) and at the legacy
 * `/api/public/sync` path, which shipped tills still call. Both run exactly
 * the same authorisation: prove the caller, resolve their branch and
 * permissions on the server, then commit only what those allow.
 */
import { z } from "zod";

const opSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("insert"),
    table: z.string().min(1).max(64),
    rows: z.array(z.record(z.string(), z.unknown())).max(500),
  }),
  z.object({
    kind: z.literal("upsert"),
    table: z.string().min(1).max(64),
    rows: z.array(z.record(z.string(), z.unknown())).max(500),
    onConflict: z.string().max(120).optional(),
  }),
  z.object({
    kind: z.literal("update"),
    table: z.string().min(1).max(64),
    values: z.record(z.string(), z.unknown()),
    match: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal("delete"),
    table: z.string().min(1).max(64),
    match: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal("rpc"),
    table: z.string().min(1).max(64),
    // Only routines the relay knows about are accepted, and it re-checks the
    // caller's branch and permission before running one.
    fn: z.enum(["sale_refund"]),
    args: z.record(z.string(), z.unknown()),
  }),
]);


const bodySchema = z.object({
  sessionToken: z.string().max(400).optional(),
  cashierToken: z.string().max(2000).optional(),
  terminalToken: z.string().max(200).optional(),
  accessToken: z.string().max(4000).optional(),
  ops: z.array(opSchema).max(50).optional(),
  read: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("activeShift"), storeId: z.string().min(1).max(64) }),
      z.object({ kind: z.literal("stores") }),
    ])
    .optional(),
});

export async function handleSyncRequest(request: Request): Promise<Response> {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "Malformed request" }, { status: 400 });
  }

  // Every till attaches its raw session token as a bearer. Use it when the
  // body did not carry one, so the header is a first-class proof.
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer && !body.sessionToken && bearer.length <= 400) {
    body = { ...body, sessionToken: bearer };
  } else if (bearer && !body.accessToken && bearer.length > 400) {
    body = { ...body, accessToken: bearer.slice(0, 4000) };
  }

  if (!body.ops?.length && !body.read)
    return Response.json({ ok: false, error: "Nothing to do" }, { status: 400 });

  const { verifyRelayCaller, runRelayOp, runRelayRead, hasServiceKey } = await import(
    "@/core/api/pos-relay.server"
  );
  // Without the internal key the relay cannot do anything: answer with a
  // readable "temporarily unavailable" instead of a blank server error.
  if (!hasServiceKey()) {
    return Response.json(
      {
        ok: false,
        code: "NO_SERVICE_KEY",
        error:
          "Central database key missing on this server — an administrator needs to re-save it. Work is being queued locally in the meantime.",
      },
      { status: 503 },
    );
  }

  // Every request re-checks the caller: token live AND its branch still
  // present. A caller whose branch was deleted is refused with a reason the
  // till can act on instead of a blank failure.
  const { resolveRelayScope } = await import("@/core/api/relay-policy.server");
  let scope: Awaited<ReturnType<typeof resolveRelayScope>>;
  try {
    const caller = await verifyRelayCaller(body);
    if (caller.storeId) {
      const { branchExists } = await import("./session-verify.server");
      if (!(await branchExists(caller.storeId))) {
        return Response.json(
          {
            ok: false,
            code: "BRANCH_MISSING",
            error: "Your session or branch is no longer active. Please sign in again.",
          },
          { status: 401 },
        );
      }
    }
    scope = await resolveRelayScope(caller);
  } catch (e) {
    return Response.json(
      { ok: false, code: "SESSION_INVALID", error: (e as Error).message },
      { status: 401 },
    );
  }

  if (body.read) {
    // A till may only ask about its own branch.
    if (body.read.kind === "activeShift" && !scope.isSupervisor && body.read.storeId !== scope.storeId)
      return Response.json(
        { ok: false, code: "STORE_FORBIDDEN", error: "You can only read your own branch." },
        { status: 403 },
      );
    try {
      const result = await runRelayRead(body.read);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
    }
  }

  const results: {
    ok: boolean;
    error?: string;
    code?: string;
    table?: string;
    kind?: string;
  }[] = [];
  const { batchInsertIds } = await import("@/core/api/relay-policy.server");
  const all = body.ops ?? [];
  const rpcs = all.filter((o) => o.kind === "rpc");
  const ops = all.filter((o) => o.kind !== "rpc");
  // Parents inserted in this same push let their child rows through.
  const batchIds = batchInsertIds(ops);
  for (const op of all) {
    try {
      const result =
        op.kind === "rpc"
          ? await (await import("@/core/api/pos-relay.server")).runRelayRpc(op, scope)
          : await runRelayOp(op, scope, batchIds);
      results.push({ ...result, table: op.table, kind: op.kind });
    } catch (e) {
      results.push({ ok: false, error: (e as Error).message, table: op.table, kind: op.kind });
    }
  }
  void rpcs;

  const refused = results.find(
    (r) =>
      r.code === "STORE_FORBIDDEN" ||
      r.code === "PERMISSION_DENIED" ||
      r.code === "SCOPE_MISSING" ||
      r.code === "SCOPE_STALE",
  );
  if (refused) {
    // One readable line per refusal so a live server shows why, without ever
    // logging a token, a key or the row contents.
    console.warn(
      `[sync] refused ${refused.kind} on ${refused.table}: ${refused.code} ` +
        `(caller=${scope.kind}/${scope.label}, role=${scope.roleSlug ?? scope.role ?? "none"}, ` +
        `branch=${scope.storeId ?? "none"}, supervisor=${scope.isSupervisor})`,
    );
  }
  return Response.json(
    {
      ok: results.every((r) => r.ok),
      results,
      ...(refused?.code
        ? {
            code: refused.code,
            error: refused.error,
            detail: {
              table: refused.table,
              kind: refused.kind,
              role: scope.roleSlug ?? scope.role ?? null,
              branch: scope.storeId ?? null,
              supervisor: scope.isSupervisor,
            },
          }
        : {}),
    },
    { status: refused ? 403 : 200 },
  );
}
