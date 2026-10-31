import fs from "fs";
import path from "path";

describe("Provider wizard review edit back", () => {
  it("goBack returns to review when editingFromReview", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/features/provider-onboarding/OnboardingWizardContext.tsx"),
      "utf8",
    );
    expect(src).toContain("editingFromReview && currentStep < REVIEW_STEP_ID");
    expect(src).toContain("setCurrentStepState(REVIEW_STEP_ID)");
  });
});
