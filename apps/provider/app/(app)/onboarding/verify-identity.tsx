/**
 * Optional identity-verification step shown right after the onboarding wizard
 * is submitted (free plan) or after a paid checkout returns.
 *
 * Route path is UNCHANGED — all finalizeOnboardingSuccess completion paths
 * continue to route here and finalize-onboarding.test.ts contract is preserved.
 *
 * Identity verification is OPTIONAL by default. When provider_verification
 * is enabled (flag on), the screen shows "Verify to go live" but never
 * hard-locks onboarding — the provider can always reach the dashboard.
 *
 * "Back to setup" affordance added so providers can return to the wizard
 * to change business/plan details.
 */
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
  ProviderVerificationPanel,
  type NormalizedVerificationStatus,
} from "@/components/verification/ProviderVerificationPanel";
import { twStyle } from "@/lib/twStyle";
import { Shadows } from "@/constants/colors";
import { hapticLight } from "@/lib/haptics-safe";

export default function OnboardingVerifyIdentityScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<NormalizedVerificationStatus>("not_started");

  const goToDashboard = useCallback(() => {
    hapticLight();
    router.replace("/(app)/(tabs)/dashboard" as never);
  }, [router]);

  const goBackToSetup = useCallback(() => {
    hapticLight();
    // Return to the onboarding wizard (last step)
    router.back();
  }, [router]);

  // Explicit status handling (replaces isDone heuristic)
  const isApproved     = status === "approved";
  const isPendingReview= status === "pending_review";
  const isRejected     = status === "rejected";
  const isExpired      = status === "expired" || status === "abandoned";
  const isInProgress   = status === "in_progress";

  const continueLabel = isApproved
    ? "Continue to dashboard"
    : isPendingReview
      ? "Continue — we'll notify you when verified"
      : "Do this later — go to dashboard";

  return (
    <ScreenContainer
      scrollable={false}
      noPadding
      edges={["top"]}
      reserveTabBarSpace={false}
      keyboardAvoiding
    >
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Verify your identity"
          subtitle="Optional — you can do this later"
          showBack={false}
          rightAction={
            <TouchableOpacity
              onPress={goToDashboard}
              style={twStyle(
                "flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm",
              )}
              accessibilityRole="button"
              accessibilityLabel="Skip for now and go to dashboard"
              activeOpacity={0.85}
            >
              <Text style={twStyle("text-[12px] font-semibold text-slate-700")}>Skip for now</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* Back to setup affordance */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
        <TouchableOpacity
          onPress={goBackToSetup}
          style={twStyle("flex-row items-center gap-1 py-2")}
          accessibilityRole="button"
          accessibilityLabel="Go back to setup"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back-outline" size={16} color="#6b7280" />
          <Text style={twStyle("text-sm text-gray-500")}>Back to setup</Text>
        </TouchableOpacity>
      </View>

      <ProviderVerificationPanel
        onStatusChange={setStatus}
        onApproved={goToDashboard}
        footer={
          <TouchableOpacity
            onPress={goToDashboard}
            style={[twStyle("items-center rounded-full bg-primary py-4"), Shadows.card]}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={continueLabel}
          >
            <View style={twStyle("flex-row items-center gap-2")}>
              <Ionicons
                name={isApproved ? "checkmark-circle-outline" : "home-outline"}
                size={18}
                color="#fff"
              />
              <Text style={twStyle("text-[16px] font-semibold text-white")}>
                {continueLabel}
              </Text>
            </View>
          </TouchableOpacity>
        }
      />
    </ScreenContainer>
  );
}
