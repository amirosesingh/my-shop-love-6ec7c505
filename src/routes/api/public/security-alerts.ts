/**
 * POST /api/public/security-alerts — deployment scanners post their findings
 * here. Callers must sign the raw body with the shared ingest secret; the
 * signed payload is forwarded to the database, which de-duplicates findings and
 * closes ones that no longer appear.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payload = z.object({
  deploymentRef: z.string().max(200).default(""),
  findings: z
    .array(
      z.object({
        id: z.string().max(160).optional(),
        severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
        title: z.string().min(1).max(200),
        detail: z.string().max(4000).optional(),
      }),
    )
    .max(200),
});

function signatureMatches(raw: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.replace(/^sha256=/i, "").trim();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

async function handle({ request }: { request: Request }) {
  const secret = process.env["SECURITY_ALERT_INGEST_SECRET"];
  if (!secret) {
    return Response.json({ error: "Ingest is not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-security-signature") ?? "";
  if (!signature || !signatureMatches(raw, signature, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let parsed;
  try {
    parsed = payload.safeParse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });

  let url: string;
  let key: string;
  try {
    const { supabaseConfig } = await import("@/lib/external-supabase-config");
    ({ url, key } = supabaseConfig());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const res = await fetch(`${url}/rest/v1/rpc/security_report_findings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({
      _source: "ci",
      _deployment_ref: parsed.data.deploymentRef,
      _findings: parsed.data.findings,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Security finding ingest failed [${res.status}]: ${body}`);
    return Response.json({ error: body }, { status: res.status });
  }
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/security-alerts")({
  server: { handlers: { POST: handle } },
});
