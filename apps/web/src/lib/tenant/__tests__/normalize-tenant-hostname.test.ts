import { describe, it, expect } from "vitest";
import { normalizeTenantHostname } from "../normalize-tenant-hostname";

describe("normalizeTenantHostname", () => {
  it("lowercases and trims", () => {
    const r = normalizeTenantHostname("  WWW.Example.COM ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe("www.example.com");
  });

  it("rejects scheme and port", () => {
    expect(normalizeTenantHostname("https://x.com").ok).toBe(false);
    expect(normalizeTenantHostname("x.com:443").ok).toBe(false);
  });

  it("allows localhost", () => {
    const r = normalizeTenantHostname("localhost");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe("localhost");
  });
});
