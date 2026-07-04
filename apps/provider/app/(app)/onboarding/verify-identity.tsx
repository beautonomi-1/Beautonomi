/**
 * Post-onboarding identity verification — copy and skip behaviour follow the
 * tenant `provider_verification` flag (superadmin → Required for provider setup/go-live).
 */
import { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
  ProviderVerificationPanel,
  type NormalizedVerificationStatus,
} from "@/components/verification/ProviderVerificationPanel";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useApi } from "@/hooks/useApi";
import {
  canSkipProviderVerification,
  providerVerificationContinueLabel,
  providerVerificationSubtitle,
  verificationPolicyFromBundle,
} from "@/lib/verification/policy";
import { twStyle } from "@/lib/twStyle";
import { Shadows } from "@/constants/colors";
import { hapticLight } from "@/lib/haptics-safe";

export default function OnboardingVerifyIdentityScreen() {
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const bundlePolicy = verificationPolicyFromBundle(bundle);
  const env = bundle?.meta?.env ?? "production";
  const { data: verificationStatus } = useApi<{
    required_for_providers?: boolean;
  }>(`/api/provider/verification/status?environment=${encodeURIComponent(env)}`);

  const verificationRequired =
    verificationStatus?.required_for_providers ?? bundlePolicy.required_for_providers;

  const [status, setStatus] = useState<NormalizedVerificationStatus>("not_started");

  const canSkip = useMemo(
    () => canSkipProviderVerification({ required: verificationRequired, status }),
    [verificationRequired, status],
  );

  const goToDashboard = useCallback(() => {
    if (!canSkip) {
      Alert.alert(
        "Verification required",
        "Identity verification is required before you can go live. Complete verification to earn your Verified trust badge.",
      );
      return;
    }
    hapticLight();
    router.replace("/(app)/(tabs)/dashboard" as never);
  }, [canSkip, router]);

  const goBackToSetup = useCallback(() => {
    hapticLight();
    router.back();
  }, [router]);

  const isApproved = status === "approved";
  const isPendingReview = status === "pending_review";
  const subtitle = providerVerificationSubtitle(verificationRequired);
  const continueLabel = providerVerificationContinueLabel({
    required: verificationRequired,
    status,
  });

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
          subtitle={subtitle}
          showBack={false}
          rightAction={
            canSkip ? (
              <TouchableOpacity
                onPress={goToDashboard}
                style={twStyle(
                  "flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm",
                )}
                accessibilityRole="button"
                accessibilityLabel={
                  isApproved || isPendingReview ? "Continue to dashboard" : "Skip for now"
                }
                activeOpacity={0.85}
              >
                <Text style={twStyle("text-[12px] font-semibold text-slate-700")}>
                  {isApproved || isPendingReview ? "Continue" : "Skip for now"}
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
      </View>

      {verificationRequired && !canSkip ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3")}>
            <Text style={twStyle("text-sm leading-5 text-amber-900")}>
              Your marketplace requires identity verification before you can go live. Complete this step to
              earn the Verified trust badge.
            </Text>
          </View>
        </View>
      ) : null}

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
              <Text style={twStyle("text-[16px] font-semibold text-white")}>{continueLabel}</Text>
            </View>
          </TouchableOpacity>
        }
      />
    </ScreenContainer>
  );
}
