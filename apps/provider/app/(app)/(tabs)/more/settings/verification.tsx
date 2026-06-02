/**
 * Identity verification (KYC) – status + start flow.
 *
 * When SumSub is configured → launches the embed URL in the device browser.
 * When SumSub is NOT configured → shows a manual document-upload form that
 * posts to /api/me/verification (same flow used by customer identity screen).
 *
 * The actual UI lives in the shared `ProviderVerificationPanel` so the
 * onboarding identity step renders the identical experience.
 */
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ProviderVerificationPanel } from "@/components/verification/ProviderVerificationPanel";

export default function VerificationScreen() {
  const router = useRouter();

  return (
    <ScreenContainer scrollable={false} noPadding>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Identity verification"
          subtitle="Required for compliance"
          onBack={() => router.back()}
        />
      </View>
      <ProviderVerificationPanel />
    </ScreenContainer>
  );
}
