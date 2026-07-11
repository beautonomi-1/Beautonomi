import fs from "fs";
import path from "path";

describe("resolveWizardEntryStep focus vs step precedence", () => {
  it("does not reset to step 1 when explicit step param is provided with unmapped focus", () => {
    const ctxPath = path.join(
      __dirname,
      "../../src/features/provider-onboarding/OnboardingWizardContext.tsx",
    );
    const src = fs.readFileSync(ctxPath, "utf8");

    expect(src).toContain("focusUnmapped &&");
    expect(src).toContain("typeof initialStep === \"number\"");
    expect(src).toContain("initialStep >= 1 && initialStep <= STEPS.length");
  });
});
