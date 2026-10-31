import fs from "fs";
import path from "path";
import { STEPS, wizardStepKeyForId } from "@/features/provider-onboarding/state";

const enPath = path.join(
  __dirname,
  "../../../../packages/i18n/src/locales/en.json",
);

describe("provider onboarding wizard step keys in en.json", () => {
  it("every STEPS id has matching title and description in en.json", () => {
    const en = JSON.parse(fs.readFileSync(enPath, "utf8")) as {
      provider: {
        mobile: {
          screens: {
            onboardingWizard: {
              steps: Record<string, { title: string; description: string }>;
            };
          };
        };
      };
    };
    const stepsJson = en.provider.mobile.screens.onboardingWizard.steps;

    for (const meta of STEPS) {
      const key = wizardStepKeyForId(meta.id);
      expect(key).toBeTruthy();
      const entry = stepsJson[key!];
      expect(entry?.title).toBe(meta.title);
      expect(entry?.description).toBe(meta.description);
    }
  });
});
