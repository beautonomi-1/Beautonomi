import fs from "fs";
import path from "path";

describe("WizardChrome step titles", () => {
  it("passes defaultValue from stepMeta for onboarding step keys", () => {
    const chromePath = path.join(
      __dirname,
      "../../src/features/provider-onboarding/WizardChrome.tsx",
    );
    const src = fs.readFileSync(chromePath, "utf8");
    expect(src).toContain("defaultValue: stepMeta?.title");
    expect(src).toContain("defaultValue: stepMeta?.description");
    expect(src).toContain("useDifferentAccount");
    expect(src).toContain("confirmUseDifferentAccount");
    expect(src).not.toMatch(/if \(loadingDraft\)[\s\S]*useFocusEffect/);
  });
});
