import { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
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
  native_route?: string | null;
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
  const optionalPending = allSteps.filter((s) => !s.required && !s.completed);
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

  const startNativeWizard = () => {
    hapticLight();
    router.push("/(app)/onboarding/wizard" as never);
  };

  const backToDashboard = () => {
    hapticLight();
    router.replace("/(app)/(tabs)/dashboard" as never);
  };

  // §provider-setup-seamless-ux 2026-05: clicking a "Still needed" item now
  // routes directly to the targeted screen (via server-returned native_route)
  // so providers can fix a single field without restarting the 14-step wizard.
  // When no dedicated native screen exists, deep-link into the wizard with
  // `?focus=<id>` so the user lands on the closest matching step (mapped in
  // `setupStepMap.ts`) rather than at step 1.
  const openStep = (step: SetupStep) => {
    hapticLight();
    if (step.native_route && step.native_route.startsWith("/(app)/")) {
      router.push(step.native_route as never);
      return;
    }
    router.push(
      `/(app)/onboarding/wizard?focus=${encodeURIComponent(step.id)}` as never,
    );
  };

  // Refresh on focus so completing a step elsewhere updates the hub immediately.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

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
          colors={["#f8fafc", "#ffffff", "#ffffff"]}
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
            rightAction={
              <TouchableOpacity
                onPress={backToDashboard}
                style={twStyle(
                  "flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm",
                )}
                accessibilityRole="button"
                accessibilityLabel="Back to dashboard"
                activeOpacity={0.85}
              >
                <Ionicons name="home-outline" size={14} color="#334155" />
                <Text style={twStyle("text-[12px] font-semibold text-slate-700")}>Dashboard</Text>
              </TouchableOpacity>
            }
          />

          <View style={twStyle("mb-6 items-center")}>
            <View
              style={[
                twStyle(
                  `mb-4 h-[72px] w-[72px] items-center justify-center rounded-full ${
                    isComplete ? "bg-emerald-50" : "bg-white"
                  }`,
                ),
                !isComplete ? Shadows.cardSmall : undefined,
              ]}
            >
              <Ionicons
                name={isComplete ? "checkmark-circle" : "sparkles"}
                size={36}
                color={isComplete ? "#10b981" : "#0f172a"}
              />
            </View>
            <View
              style={twStyle(
                "mb-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-1",
              )}
            >
              <Text style={twStyle("text-[12px] font-semibold text-slate-700")}>
                {isComplete ? "Ready to work" : "Guided setup · about 10–15 min"}
              </Text>
            </View>
            <Text style={twStyle("text-center text-[24px] font-bold text-slate-900")}>
              {isComplete ? "You're all set" : "Welcome to Beautonomi"}
            </Text>
            <Text style={twStyle("mt-2 max-w-sm text-center text-[15px] leading-relaxed text-slate-500")}>
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
            <View
              style={[
                twStyle("mb-5 rounded-[1.5rem] border border-slate-100 bg-white p-5"),
                Shadows.cardSmall,
              ]}
            >
              <View style={twStyle("mb-3 flex-row items-center justify-between")}>
                <Text style={twStyle("text-[14px] font-semibold text-slate-800")}>
                  {completedRequired} of {requiredSteps.length} required
                </Text>
                <View style={twStyle("rounded-full bg-slate-900/10 px-3 py-1")}>
                  <Text style={twStyle("text-[12px] font-bold text-slate-900")}>{pct}%</Text>
                </View>
              </View>
              <View style={twStyle("h-3 w-full overflow-hidden rounded-full bg-slate-100")}>
                <View
                  style={[
                    twStyle("h-full rounded-full"),
                    {
                      width: `${pct}%`,
                      minWidth: pct > 0 ? 6 : 0,
                      backgroundColor: "#0f172a",
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {!isComplete && pendingRequired.length > 0 && (
            <View
              style={[
                twStyle("mb-5 rounded-[1.5rem] border border-slate-100 bg-white p-5"),
                Shadows.cardSmall,
              ]}
            >
              <View style={twStyle("mb-4 flex-row items-center gap-2")}>
                <Ionicons name="flash-outline" size={16} color="#0f172a" />
                <Text
                  style={twStyle("text-[12px] font-bold uppercase tracking-wider text-slate-500")}
                >
                  Required to go live
                </Text>
              </View>
              {pendingRequired.map((s, idx) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => openStep(s)}
                  activeOpacity={0.7}
                  style={twStyle(
                    `flex-row items-center gap-4 py-3.5 ${idx === 0 ? "" : "border-t border-slate-50"}`,
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${s.title}`}
                >
                  <View
                    style={twStyle(
                      "h-10 w-10 items-center justify-center rounded-full bg-slate-50",
                    )}
                  >
                    <Text style={twStyle("text-[15px] font-bold text-slate-900")}>{idx + 1}</Text>
                  </View>
                  <Text style={twStyle("flex-1 text-[16px] font-semibold text-slate-900")}>
                    {s.title}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!isComplete && optionalPending.length > 0 && (
            <View
              style={[
                twStyle("mb-5 rounded-[1.5rem] border border-slate-100 bg-white p-5"),
                Shadows.cardSmall,
              ]}
            >
              <View style={twStyle("mb-4 flex-row items-center gap-2")}>
                <Ionicons name="star-outline" size={16} color="#64748b" />
                <Text
                  style={twStyle("text-[12px] font-bold uppercase tracking-wider text-slate-500")}
                >
                  Polish your profile
                </Text>
              </View>
              {optionalPending.slice(0, 4).map((s, idx) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => openStep(s)}
                  activeOpacity={0.7}
                  style={twStyle(
                    `flex-row items-center gap-4 py-3.5 ${idx === 0 ? "" : "border-t border-slate-50"}`,
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${s.title}`}
                >
                  <View
                    style={twStyle(
                      "h-10 w-10 items-center justify-center rounded-full bg-slate-50",
                    )}
                  >
                    <Ionicons name="add" size={18} color="#475569" />
                  </View>
                  <Text style={twStyle("flex-1 text-[16px] font-medium text-slate-800")}>{s.title}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!isComplete && (
            <TouchableOpacity
              onPress={startNativeWizard}
              style={[
                twStyle("mb-4 items-center rounded-full bg-slate-900 py-4.5"),
                Shadows.card,
              ]}
              activeOpacity={0.88}
              accessibilityLabel="Start full setup wizard"
              accessibilityRole="button"
            >
              <View style={twStyle("flex-row items-center gap-2")}>
                <Ionicons name="rocket-outline" size={20} color="#fff" />
                <Text style={twStyle("text-[16px] font-semibold text-white")}>
                  Start setup wizard
                </Text>
              </View>
              <Text style={twStyle("mt-1 px-6 text-center text-[13px] text-slate-300")}>
                Walks you through every step end-to-end
              </Text>
            </TouchableOpacity>
          )}

          {!isComplete && (
            <TouchableOpacity
              onPress={backToDashboard}
              style={twStyle(
                "items-center rounded-full border-2 border-slate-200 bg-white py-4",
              )}
              activeOpacity={0.85}
              accessibilityLabel="Back to dashboard"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[15px] font-semibold text-slate-700")}>
                Back to dashboard
              </Text>
            </TouchableOpacity>
          )}

          {isComplete ? (
            <TouchableOpacity
              onPress={goToApp}
              style={twStyle("items-center rounded-full bg-slate-900 py-4.5 shadow-sm")}
              activeOpacity={0.88}
              accessibilityLabel="Go to dashboard"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[16px] font-semibold text-white")}>Go to dashboard</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}
