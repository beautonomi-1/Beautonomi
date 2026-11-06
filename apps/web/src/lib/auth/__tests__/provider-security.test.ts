import { describe, expect, it } from "vitest";
import { shouldApplyProviderSessionSecurity } from "@/lib/auth/provider-security";
import { SECURITY_CHALLENGE_CODES, isSecurityChallengeCode } from "@beautonomi/auth-security";

describe("shouldApplyProviderSessionSecurity", () => {
  it("skips customer app header on provider routes", () => {
    const req = new Request("https://app.example/api/provider/profile", {
      headers: { "X-App": "customer" },
    });
    expect(shouldApplyProviderSessionSecurity(req, "provider_owner")).toBe(false);
  });

  it("applies to provider_owner on provider API", () => {
    const req = new Request("https://app.example/api/provider/profile", {
      headers: { "X-App": "provider" },
    });
    expect(shouldApplyProviderSessionSecurity(req, "provider_owner")).toBe(true);
  });

  it("exempts staff join path", () => {
    const req = new Request("https://app.example/api/provider/staff/join/accept");
    expect(shouldApplyProviderSessionSecurity(req, "provider_staff")).toBe(false);
  });
});

describe("security challenge codes", () => {
  it("recognizes canonical codes", () => {
    for (const code of SECURITY_CHALLENGE_CODES) {
      expect(isSecurityChallengeCode(code)).toBe(true);
    }
    expect(isSecurityChallengeCode("MFA_REQUIRED")).toBe(false);
  });
});
