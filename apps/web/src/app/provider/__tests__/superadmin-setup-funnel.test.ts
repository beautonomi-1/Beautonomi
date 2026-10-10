import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("superadmin provider setup funnel (web)", () => {
  it("ProviderPortalGate allows admin portal on onboarding allowlist routes", () => {
    const src = readFileSync(
      join(__dirname, "..", "ProviderPortalGate.tsx"),
      "utf8",
    );
    expect(src).toMatch(/portal === "admin"/);
    expect(src).toContain("isProviderOnboardingRouteAllowed(pathname)");
  });

  it("provider layout includes superadmin on get-started and subscription RoleGuard", () => {
    const src = readFileSync(join(__dirname, "..", "layout.tsx"), "utf8");
    expect(src).toContain('"superadmin"');
    expect(src).toMatch(/isGetStartedPage \|\| isSubscriptionPage/);
    expect(src).toContain("PROVIDER_SETUP_ROLES");
  });

  it("onboarding wizard RoleGuard includes superadmin", () => {
    const src = readFileSync(
      join(__dirname, "..", "onboarding", "page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/allowedRoles=\{[\s\S]*"superadmin"/);
  });
});
