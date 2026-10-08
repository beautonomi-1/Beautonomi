import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("provider onboarding RoleGuard", () => {
  it("allows superadmin alongside onboarding roles", () => {
    const src = readFileSync(
      join(__dirname, "..", "page.tsx"),
      "utf8",
    );
    expect(src).toContain('"superadmin"');
    expect(src).toMatch(/allowedRoles=\{[\s\S]*"provider_onboarding"[\s\S]*"superadmin"/);
  });
});
