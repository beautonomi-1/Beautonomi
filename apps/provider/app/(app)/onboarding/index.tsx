import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { Colors, Shadows } from "@/constants/colors";
import { hapticLight } from "@/lib/haptics-safe";

type SetupStep = {
  id: string;
  title: string;
  completed: boolean;
  required: boolean;
};

type SetupStatus = {
  isComplete?: boolean;
  completionPercentage?: number;
  steps?: SetupStep[];
};

/**
 * Entry hub for new providers.
 * Uses the same /api/provider/setup-status data as the web get-started page.
 * Completion % and counts are based on required steps only.
 */
export default function OnboardingHubScreen() {
  const router = useRouter();
  const { screenPadding, isTablet, contentMaxWidth } = useResponsive();
  const { data, loading, error, refresh } = useApi<SetupStatus>("/api/provider/setup-status");

  const status = data as SetupStatus | null;
  const isComplete = status?.isComplete ?? false;
  const allSteps = status?.steps ?? [];
  const requiredSteps = allSteps.filter((s) => s.required);
  const completedRequired = requiredSteps.filter((s) => s.completed).length;
  const pendingRequired = requiredSteps.filter((s) => !s.completed);
  const remaining = pendingRequired.length;
  const pct = status?.completionPercentage ?? 0;

  const tabletCenter = isTablet
    ? {
        maxWidth: contentMaxWidth,
        width: "100%" as const,
        alignSelf: "center" as const,
      }
    : undefined;

  const goToApp = () => {
    hapticLight();
    router.replace("/(app)/(tabs)" as never);
  };

  const goToSetupStatus = () => {
    hapticLight();
    router.push("/(app)/(tabs)/more/settings/setup-status" as never);
  };

  const startNativeWizard = () => {
    hapticLight();
    router.push("/(app)/onboarding/wizard" as never);
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <ScreenHeader title="Set up" showBack={false} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer noPadding edges={["top"]} reserveTabBarSpace={false}>
      <View style={[{ flex: 1 }, tabletCenter]}>
        <LinearGradient
          colors={["#FFF5F9", "#FFFFFF", "#FFFFFF"]}
          locations={[0, 0.45, 1]}
          style={{
            paddingHorizontal: screenPadding,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          <ScreenHeader
            title="Set up"
            showBack={false}
            subtitle={isComplete ? "Everything looks good" : "A few steps to go live"}
          />

          <View style={twStyle("mb-6 items-center")}>
            <View
              style={[
                twStyle(
                  `mb-4 h-[72px] w-[72px] items-center justify-center rounded-[22px] ${
                    isComplete ? "bg-green-50" : "bg-white"
                  }`,
                ),
                !isComplete ? Shadows.cardSmall : undefined,
              ]}
            >
              <Ionicons
                name={isComplete ? "checkmark-circle" : "sparkles"}
                size={36}
                color={isComplete ? Colors.success : Colors.primary}
              />
            </View>
            <View
              style={twStyle(
                "mb-3 rounded-full border border-primary/15 bg-primaryLight px-3 py-1",
              )}
            >
              <Text style={twStyle("text-xs font-semibold text-primary")}>
                {isComplete ? "Ready to work" : "Guided setup · about 10–15 min"}
              </Text>
            </View>
            <Text style={twStyle("text-center text-2xl font-bold text-gray-900")}>
              {isComplete ? "You're all set" : "Welcome to Beautonomi"}
            </Text>
            <Text style={twStyle("mt-2 max-w-sm text-center text-[15px] leading-[22px] text-gray-500")}>
              {isComplete
                ? "Your profile is live. Accept bookings and manage your business from the app."
                : remaining > 0
                  ? `${remaining} required step${remaining === 1 ? "" : "s"} left before you can go fully live.`
                  : "Complete the required steps to start accepting bookings."}
            </Text>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: screenPadding, paddingBottom: 32 }}>
          {!isComplete && requiredSteps.length > 0 && (
            <View style={twStyle("mb-5")}>
              <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                <Text style={twStyle("text-xs font-medium text-gray-500")}>
                  {completedRequired} of {requiredSteps.length} required steps
                </Text>
                <Text style={twStyle("text-xs font-bold text-gray-800")}>{pct}%</Text>
              </View>
              <View style={twStyle("h-2.5 w-full overflow-hidden rounded-full bg-gray-100")}>
                <View
                  style={[
                    twStyle("h-full rounded-full"),
                    {
                      width: `${pct}%`,
                      minWidth: pct > 0 ? 4 : 0,
                      backgroundColor: Colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {!isComplete && pendingRequired.length > 0 && (
            <View
              style={[
                twStyle("mb-5 rounded-2xl border border-gray-100 bg-white p-4"),
                Shadows.cardSmall,
              ]}
            >
              <Text
                style={twStyle("mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400")}
              >
                Still needed
              </Text>
              {pendingRequired.slice(0, 5).map((s) => (
                <View key={s.id} style={twStyle("flex-row items-center gap-2.5 py-1.5")}>
                  <View style={twStyle("h-2 w-2 rounded-full bg-primary/50")} />
                  <Text style={twStyle("flex-1 text-[15px] text-gray-800")}>{s.title}</Text>
                </View>
              ))}
              {pendingRequired.length > 5 && (
                <Text style={twStyle("mt-1 text-xs text-gray-400")}>
                  +{pendingRequired.length - 5} more on the checklist
                </Text>
              )}
            </View>
          )}

          {!isComplete && (
            <TouchableOpacity
              onPress={startNativeWizard}
              style={[
                twStyle("mb-3 items-center rounded-2xl bg-primary py-4"),
                Shadows.card,
              ]}
              activeOpacity={0.88}
              accessibilityLabel="Start full setup"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base font-semibold text-white")}>Start setup wizard</Text>
              <Text style={twStyle("mt-1 px-6 text-center text-xs text-white/85")}>
                Step-by-step — works on phone, tablet, and web
              </Text>
            </TouchableOpacity>
          )}

          {!isComplete && (
            <TouchableOpacity
              onPress={goToSetupStatus}
              style={twStyle(
                "mb-3 items-center rounded-2xl border border-gray-200 bg-gray-50 py-3.5",
              )}
              activeOpacity={0.85}
              accessibilityLabel="Open setup checklist"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-sm font-semibold text-gray-800")}>View checklist</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>Jump to any individual step</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={goToApp}
            style={twStyle(
              `items-center rounded-2xl py-4 ${isComplete ? "bg-primary" : "bg-gray-900"}`,
            )}
            activeOpacity={0.88}
            accessibilityLabel={isComplete ? "Go to dashboard" : "Continue to app"}
            accessibilityRole="button"
          >
            <Text style={twStyle("text-base font-semibold text-white")}>
              {isComplete ? "Go to dashboard" : "Continue to app"}
            </Text>
            {!isComplete ? (
              <Text style={twStyle("mt-1 px-4 text-center text-xs text-white/75")}>
                You can explore the app anytime; finish setup when you are ready.
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
