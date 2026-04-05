import { OnboardingWizardProvider } from "@/features/provider-onboarding/OnboardingWizardContext";
import { WizardChrome } from "@/features/provider-onboarding/WizardChrome";

/**
 * Full native provider onboarding wizard (all steps in-app; no WebView).
 */
export default function ProviderOnboardingWizardScreen() {
  return (
    <OnboardingWizardProvider>
      <WizardChrome />
    </OnboardingWizardProvider>
  );
}
