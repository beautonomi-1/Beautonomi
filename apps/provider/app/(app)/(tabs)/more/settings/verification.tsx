/**
 * Identity verification (KYC) – status + start flow.
 *
 * Uses Didit automated KYC (native SDK with in-app browser fallback) via the
 * shared `ProviderVerificationPanel`, so the onboarding identity step and the
 * settings screen render the identical experience.
 */
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ProviderVerificationPanel } from "@/components/verification/ProviderVerificationPanel";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { providerVerificationSubtitle, verificationPolicyFromBundle } from "@/lib/verification/policy";

export default function VerificationScreen() {
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const verificationRequired = verificationPolicyFromBundle(bundle).required_for_providers;

  return (
    <ScreenContainer scrollable={false} noPadding>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Identity verification"
          subtitle={providerVerificationSubtitle(verificationRequired)}
          onBack={() => router.back()}
        />
      </View>
      <ProviderVerificationPanel />
    </ScreenContainer>
  );
}
