import { describe, expect, it } from "vitest";
import { resolvePortalAwareReturnPathname } from "../post-login-return-path";

describe("resolvePortalAwareReturnPathname", () => {
  it("keeps provider onboarding users inside setup routes", () => {
    expect(resolvePortalAwareReturnPathname("provider_onboarding", "/provider/onboarding")).toBe(
      "/provider/onboarding",
    );
    expect(resolvePortalAwareReturnPathname("provider_onboarding", "/provider/get-started")).toBe(
      "/provider/get-started",
    );
  });

  it("sends provider onboarding users away from active-provider routes", () => {
    expect(resolvePortalAwareReturnPathname("provider_onboarding", "/provider/dashboard")).toBe(
      "/provider/get-started",
    );
  });
});
