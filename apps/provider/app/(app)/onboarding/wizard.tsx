import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { OnboardingWizardProvider } from "@/features/provider-onboarding/OnboardingWizardContext";
import { WizardChrome } from "@/features/provider-onboarding/WizardChrome";
import { wizardStepForSetupStatusId } from "@/features/provider-onboarding/setupStepMap";
import { STEPS } from "@/features/provider-onboarding/state";

/**
 * Full native provider onboarding wizard (all steps in-app; no WebView).
 *
 * Supported URL params (all optional):
 *   - `step`   — absolute wizard step number (1…STEPS.length). Wins over `focus`.
 *   - `focus`  — setup-status step id (e.g. `services`, `service-address`). Mapped
 *                to the closest wizard step via {@link wizardStepForSetupStatusId}
 *                so the dashboard/More completion card can deep-link to the exact
 *                step a provider still needs to fix.
 */
export default function ProviderOnboardingWizardScreen() {
  const params = useLocalSearchParams<{ step?: string; focus?: string }>();

  const initialStep = useMemo<number | undefined>(() => {
    const rawStep = typeof params.step === "string" ? Number(params.step) : NaN;
    if (Number.isFinite(rawStep) && rawStep >= 1 && rawStep <= STEPS.length) {
      return rawStep;
    }
    const focus = typeof params.focus === "string" ? params.focus : null;
    const mapped = wizardStepForSetupStatusId(focus);
    if (mapped && mapped >= 1 && mapped <= STEPS.length) return mapped;
    return undefined;
  }, [params.step, params.focus]);

  return (
    <OnboardingWizardProvider initialStep={initialStep}>
      <WizardChrome />
    </OnboardingWizardProvider>
  );
}
