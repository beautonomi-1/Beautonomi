import fs from "fs";
import path from "path";

describe("OnboardingWizardContext mount guard", () => {
  it("auto-finalizes when provider exists on submit step without focus override", () => {
    const ctxPath = path.join(
      __dirname,
      "../../src/features/provider-onboarding/OnboardingWizardContext.tsx",
    );
    const src = fs.readFileSync(ctxPath, "utf8");

    expect(src).toContain("probeProviderProfileExists");
    expect(src).toContain("providerExists && resolved === onSubmitStep && !hasFocusOverride");
    expect(src).toContain('"/api/provider/onboarding"');
    expect(src).toContain("resolveCheckoutFlagsForRecovery");
    expect(src).toContain("timeout: 120_000");
    expect(src).toContain('errCode === "TIMEOUT"');
    expect(src).toContain('errCode === "ALREADY_EXISTS"');
  });
});
