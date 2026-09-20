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
    fn: z.enum(["pos_sale_commit", "sale_refund", "shift_cash_count_submit"]),
    args: z.record(z.string(), z.unknown()),
  }),
]);


const bodySchema = z.object({
  sessionToken: z.string().max(400).optional(),
  cashierToken: z.string().max(2000).optional(),
  terminalToken: z.string().max(200).optional(),
  accessToken: z.string().max(4000).optional(),
  ops: z.array(opSchema).max(50).optional(),
  sqlServerBatch: z.object({
    batchId: z.string().uuid(),
    organizationId: z.string().min(1).max(128),
    branchId: z.string().min(1).max(128),
    table: z.string().regex(/^[a-z_][a-z0-9_]*$/).max(64),
    rows: z.array(z.record(z.string(), z.unknown())).max(2000),
    changes: z.array(z.record(z.string(), z.unknown())).max(2000),
  }).optional(),
  sqlServerAggregate: z.object({
    batchId: z.string().uuid(), organizationId: z.string().min(1).max(128), branchId: z.string().min(1).max(128),
    operations: z.array(z.object({
      table: z.string().regex(/^[a-z_][a-z0-9_]*$/).max(64),
      rows: z.array(z.record(z.string(), z.unknown())).max(2000),
      changes: z.array(z.record(z.string(), z.unknown())).max(2000),
    })).min(1).max(200),
  }).optional(),
  sqlServerPull: z.object({
    organizationId: z.string().min(1).max(128), branchId: z.string().min(1).max(128),
    cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), limit: z.number().int().min(100).max(2000),
  }).optional(),
  sqlServerBootstrap: z.object({
    organizationId: z.string().min(1).max(128), branchId: z.string().min(1).max(128),
    table: z.string().regex(/^[a-z_][a-z0-9_]*$/).max(64), cursor: z.string().max(512).nullable(),
    historyDays: z.number().int().min(30).max(7300), limit: z.number().int().min(100).max(2000),
  }).optional(),
  sqlServerCounts: z.object({ organizationId: z.string().min(1).max(128), branchId: z.string().min(1).max(128), historyDays: z.number().int().min(30).max(7300) }).optional(),
  oldReceipt: z.object({ lookup: z.string().min(1).max(128), branchId: z.string().min(1).max(128) }).optional(),
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
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8 * 1024 * 1024)
      return Response.json({ ok: false, code: "PAYLOAD_TOO_LARGE", error: "The sync batch exceeds 8 MiB." }, { status: 413 });
    body = bodySchema.parse(JSON.parse(raw));
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

  if (!body.ops?.length && !body.read && !body.sqlServerBatch && !body.sqlServerAggregate && !body.sqlServerPull && !body.sqlServerBootstrap && !body.sqlServerCounts && !body.oldReceipt)
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
          "Central database service key is missing on the hosted POS backend. Configure POS_SUPABASE_SERVICE_ROLE_KEY on the server deployment. Work is being queued locally in the meantime.",
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

  if (body.sqlServerBatch || body.sqlServerAggregate || body.sqlServerPull || body.sqlServerBootstrap || body.sqlServerCounts || body.oldReceipt) {
    const branchId = body.sqlServerBatch?.branchId ?? body.sqlServerAggregate?.branchId ?? body.sqlServerPull?.branchId ?? body.sqlServerBootstrap?.branchId ?? body.sqlServerCounts?.branchId ?? body.oldReceipt?.branchId ?? "";
    const mayManageOtherBranches = scope.role === "admin" || scope.roleSlug === "admin" || scope.permissions.can_manage_sync_backup === true;
    if (branchId !== scope.storeId && !mayManageOtherBranches) return Response.json({ ok:false,code:"STORE_FORBIDDEN",error:"You can only synchronize your own branch." },{status:403});
    const { serviceRest } = await import("@/core/api/pos-relay.server");
    const rpc = body.sqlServerBatch ? ["pos_sync_push_batch", {
      p_batch_id:body.sqlServerBatch.batchId,p_organization_id:body.sqlServerBatch.organizationId,p_branch_id:branchId,
      p_table:body.sqlServerBatch.table,p_rows:body.sqlServerBatch.rows,p_changes:body.sqlServerBatch.changes,
    }] as const : body.sqlServerAggregate ? ["pos_sync_push_aggregate", {
      p_batch_id:body.sqlServerAggregate.batchId,p_organization_id:body.sqlServerAggregate.organizationId,p_branch_id:branchId,p_operations:body.sqlServerAggregate.operations,
    }] as const : body.sqlServerPull ? ["pos_sync_pull", {
      p_organization_id:body.sqlServerPull.organizationId,p_branch_id:branchId,p_after_cursor:body.sqlServerPull.cursor,p_limit:body.sqlServerPull.limit,
    }] as const : body.sqlServerBootstrap ? ["pos_sync_bootstrap", {
      p_organization_id:body.sqlServerBootstrap.organizationId,p_branch_id:branchId,p_table:body.sqlServerBootstrap.table,p_after_cursor:body.sqlServerBootstrap.cursor,p_history_days:body.sqlServerBootstrap.historyDays,p_limit:body.sqlServerBootstrap.limit,
    }] as const : body.sqlServerCounts ? ["pos_sync_counts", {
      p_organization_id:body.sqlServerCounts.organizationId,p_branch_id:branchId,p_history_days:body.sqlServerCounts.historyDays,
    }] as const : ["pos_old_receipt_lookup",{p_lookup:body.oldReceipt!.lookup,p_branch_id:branchId}] as const;
    const response=await serviceRest(`rpc/${rpc[0]}`,{method:"POST",body:JSON.stringify(rpc[1])});
    return new Response(await response.text(),{status:response.status,headers:{"content-type":"application/json"}});
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
    console.warn(`[sync] refused ${refused.kind} on ${refused.table}: ${refused.code}`);
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
