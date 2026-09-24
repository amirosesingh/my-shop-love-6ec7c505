import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, withWebSecurityHeaders } from "../web-security-headers";

describe("hosted application security headers", () => {
  it("allows only app scripts and the configured database connection", () => {
    const policy = contentSecurityPolicy("https://project-ref.supabase.co/path");
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain(
      "connect-src 'self' https://project-ref.supabase.co wss://project-ref.supabase.co",
    );
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("preserves the response while applying browser protections", async () => {
    const secured = withWebSecurityHeaders(
      new Response("ready", {
        status: 202,
        headers: { "content-type": "text/plain", "x-existing": "kept" },
      }),
      "https://project-ref.supabase.co",
    );

    expect(secured.status).toBe(202);
    expect(secured.headers.get("x-existing")).toBe("kept");
    expect(secured.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(secured.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await secured.text()).toBe("ready");
  });
});
