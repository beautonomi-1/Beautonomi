/**
 * Optional identity-verification step shown right after the onboarding wizard
 * is submitted (free plan) or after a paid checkout returns. The provider row
 * now exists, so both SumSub (when configured) and manual upload work fully.
 *
 * Identity verification is OPTIONAL and never blocks going live — both the
 * skip link and the continue button land the provider on the dashboard.
 */
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
  ProviderVerificationPanel,
  type VerificationStatus,
} from "@/components/verification/ProviderVerificationPanel";
import { twStyle } from "@/lib/twStyle";
import { Shadows } from "@/constants/colors";
import { hapticLight } from "@/lib/haptics-safe";

export default function OnboardingVerifyIdentityScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<VerificationStatus>("pending");

  const goToDashboard = useCallback(() => {
    hapticLight();
    router.replace("/(app)/(tabs)/dashboard" as never);
  }, [router]);

  const isDone = status === "approved" || status === "in_progress";

  return (
    <ScreenContainer scrollable={false} noPadding edges={["top"]} reserveTabBarSpace={false} keyboardAvoiding>
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

      <ProviderVerificationPanel
        onStatusChange={setStatus}
        footer={
          <TouchableOpacity
            onPress={goToDashboard}
            style={[twStyle("items-center rounded-full bg-primary py-4"), Shadows.card]}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Continue to dashboard"
          >
            <View style={twStyle("flex-row items-center gap-2")}>
              <Ionicons name="home-outline" size={18} color="#fff" />
              <Text style={twStyle("text-[16px] font-semibold text-white")}>
                {isDone ? "Continue to dashboard" : "Do this later — go to dashboard"}
              </Text>
            </View>
          </TouchableOpacity>
        }
      />
    </ScreenContainer>
  );
}
