import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAdminSpaReportOnlyCsp, buildReportOnlyCsp } from "@/lib/security/csp-nonce";

describe("report-only CSP", () => {
  it("keeps nonce and strict-dynamic for Next.js documents", () => {
    const policy = buildReportOnlyCsp("abc");
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows Supabase-hosted video/audio (explore posts) and local blob previews", () => {
    const policy = buildReportOnlyCsp("abc");
    expect(policy).toContain("media-src 'self' blob: data: https://*.supabase.co https://*.supabase.in");
  });

  it("enforced next.config CSP also sets media-src (default-src 'self' would block Supabase video)", () => {
    const config = readFileSync(join(__dirname, "..", "..", "..", "..", "next.config.mjs"), "utf8");
    expect(config).toContain(`"media-src 'self' blob: data: https://*.supabase.co https://*.supabase.in"`);
  });

  it("allows the Vite admin shell to load its own scripts without a nonce", () => {
    const policy = buildAdminSpaReportOnlyCsp();
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).not.toContain("strict-dynamic");
    expect(policy).not.toContain("nonce-");
  });
});
