import { describe, expect, it } from "vitest";
import { buildAdminSpaReportOnlyCsp, buildReportOnlyCsp } from "@/lib/security/csp-nonce";

describe("report-only CSP", () => {
  it("keeps nonce and strict-dynamic for Next.js documents", () => {
    const policy = buildReportOnlyCsp("abc");
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows the Vite admin shell to load its own scripts without a nonce", () => {
    const policy = buildAdminSpaReportOnlyCsp();
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).not.toContain("strict-dynamic");
    expect(policy).not.toContain("nonce-");
  });
});
