import { useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { Colors, Shadows } from "@/constants/colors";
import { hapticLight } from "@/lib/haptics-safe";
import {
  isBiometricSetupPromptDismissed,
  setBiometricPromptPending,
} from "@/lib/biometric-setup-prompt";

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
  const { signOut, user } = useAuth();
  const { provider } = useProvider();
  const { screenPadding, isTablet, contentMaxWidth } = useResponsive();
  const { data, loading, error, refresh } = useApi<SetupStatus>("/api/provider/setup-status");

  const isPendingApproval = provider?.status === "pending_approval";
  const isSuspended = provider?.status === "suspended";

  const status = data as SetupStatus | null;
  const isComplete = status?.isComplete ?? false;
  const allSteps = status?.steps ?? [];
  const hasSetupSteps = allSteps.length > 0;
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

  const goToApp = async () => {
    hapticLight();
    const uid = user?.id;
    if (isComplete && uid) {
      const dismissed = await isBiometricSetupPromptDismissed(uid);
      if (!dismissed) setBiometricPromptPending(uid);
    }
    router.replace("/(app)/(tabs)" as never);
  };

  const startNativeWizard = () => {
    hapticLight();
    const nextStep = pendingRequired[0] || optionalPending[0];
    if (nextStep) {
      router.push(`/(app)/onboarding/wizard?focus=${encodeURIComponent(nextStep.id)}` as never);
    } else {
      router.push("/(app)/onboarding/wizard" as never);
    }
  };

  const confirmSignOut = () => {
    hapticLight();
    Alert.alert(
      "Sign out?",
      "You can finish setup later. Your progress is saved to your account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/login" as never);
          },
        },
      ],
    );
  };

  // §provider-setup-seamless-ux 2026-05: clicking a step now routes directly
  // to the targeted screen (via server-returned native_route) so providers
  // can fix a single field without restarting the wizard. When no dedicated
  // native screen exists, deep-link into the wizard with `?focus=<id>` so
  // the user lands on the closest matching step rather than at step 1.
  //
  // §provider-onboarding-2026-05: wrap router.push in a defensive try/catch
  // so a malformed/stale `native_route` from the server (e.g. a route that
  // was renamed without bumping the API) never throws and locks the
  // checklist UI — we silently fall back to the wizard instead.
  const openStep = (step: SetupStep) => {
    hapticLight();
    const pushSafely = (target: string) => {
      try {
        router.push(target as never);
      } catch (err) {
        console.warn("Setup step navigation failed, falling back to wizard:", err);
        try {
          router.push(
            `/(app)/onboarding/wizard?focus=${encodeURIComponent(step.id)}` as never,
          );
        } catch {
          router.push("/(app)/onboarding/wizard" as never);
        }
      }
    };
    if (step.native_route && step.native_route.startsWith("/(app)/")) {
      pushSafely(step.native_route);
      return;
    }
    pushSafely(`/(app)/onboarding/wizard?focus=${encodeURIComponent(step.id)}`);
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
          colors={[Colors.primaryLight, "#ffffff", "#ffffff"]}
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
            subtitle={
              isComplete
                ? isPendingApproval
                  ? "Setup complete — under review"
                  : "Everything looks good"
                : hasSetupSteps
                  ? "A few steps to go live"
                  : "Start your provider profile"
            }
            rightAction={
              isComplete ? (
                <TouchableOpacity
                  onPress={goToApp}
                  style={twStyle(
                    "flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm",
                  )}
                  accessibilityRole="button"
                  accessibilityLabel="Go to dashboard"
                  activeOpacity={0.85}
                >
                  <Ionicons name="home-outline" size={14} color="#334155" />
                  <Text style={twStyle("text-[12px] font-semibold text-slate-700")}>Dashboard</Text>
                </TouchableOpacity>
              ) : undefined
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
                color={isComplete ? "#10b981" : Colors.primary}
              />
            </View>
            <View
              style={twStyle(
                "mb-3 rounded-full border border-primary/20 bg-primary/10 px-3 py-1",
              )}
            >
              <Text style={twStyle("text-[12px] font-semibold text-primary")}>
                {isComplete
                  ? isSuspended
                    ? "Account suspended"
                    : isPendingApproval
                      ? "Under review"
                      : "Ready to work"
                  : isSuspended
                    ? "Account suspended"
                    : "Guided setup · about 10–15 min"}
              </Text>
            </View>
            <Text style={twStyle("text-center text-[24px] font-bold text-slate-900")}>
              {isComplete
                ? isSuspended
                  ? "Account suspended"
                  : isPendingApproval
                    ? "Setup complete"
                    : "You're all set"
                : isSuspended
                  ? "Account suspended"
                  : "Welcome to Beautonomi"}
            </Text>
            <Text style={twStyle("mt-2 max-w-sm text-center text-[15px] leading-relaxed text-slate-500")}>
              {isComplete
                ? isSuspended
                  ? "Your provider account is suspended. Contact support to restore access before accepting new bookings."
                  : isPendingApproval
                    ? "Your profile is under review. You can explore the app and finish optional setup while we approve your listing."
                    : "Your profile is live. Accept bookings and manage your business from the app."
                : isSuspended
                  ? "Your provider account is suspended. Contact support to restore access."
                : !hasSetupSteps
                  ? "Create your business profile first. You can leave setup any time and come back when you're ready."
                : remaining > 0
                  ? `${remaining} required step${remaining === 1 ? "" : "s"} left before you can go fully live.`
                  : "Complete the required steps to start accepting bookings."}
            </Text>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: screenPadding, paddingBottom: 32 }}>
          {!isComplete && !hasSetupSteps && (
            <View
              style={[
                twStyle("mb-5 rounded-[1.5rem] border border-primary/10 bg-white p-5"),
                Shadows.cardSmall,
              ]}
            >
              <View style={twStyle("mb-4 flex-row items-center gap-3")}>
                <View style={twStyle("h-11 w-11 items-center justify-center rounded-full bg-primary/10")}>
                  <Ionicons name="business-outline" size={22} color={Colors.primary} />
                </View>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-[16px] font-bold text-slate-900")}>
                    Set up your business profile
                  </Text>
                  <Text style={twStyle("mt-1 text-[13px] leading-relaxed text-slate-500")}>
                    We will guide you through the basics before showing provider tools.
                  </Text>
                </View>
              </View>
              <View style={twStyle("gap-3")}>
                {["Business details", "Services and availability", "Payment and payout setup"].map((label) => (
                  <View key={label} style={twStyle("flex-row items-center gap-3")}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
                    <Text style={twStyle("text-[14px] font-medium text-slate-700")}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

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
                <View style={twStyle("rounded-full bg-primary/10 px-3 py-1")}>
                  <Text style={twStyle("text-[12px] font-bold text-primary")}>{pct}%</Text>
                </View>
              </View>
              <View style={twStyle("h-3 w-full overflow-hidden rounded-full bg-slate-100")}>
                <View
                  style={[
                    twStyle("h-full rounded-full"),
                    {
                      width: `${pct}%`,
                      minWidth: pct > 0 ? 6 : 0,
                      backgroundColor: Colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {!isComplete && requiredSteps.length > 0 && (
            <View
              style={[
                twStyle("mb-5 rounded-[1.5rem] border border-slate-100 bg-white p-5"),
                Shadows.cardSmall,
              ]}
            >
              <View style={twStyle("mb-4 flex-row items-center gap-2")}>
                <Ionicons name="flash-outline" size={16} color={Colors.primary} />
                <Text
                  style={twStyle("text-[12px] font-bold uppercase tracking-wider text-slate-500")}
                >
                  Required to go live
                </Text>
              </View>
              {/* §provider-onboarding-2026-05: render ALL required steps with
                  per-row state (done vs pending). Previously only pending
                  rows were rendered, so providers had no visual confirmation
                  that the work they finished elsewhere counted. */}
              {requiredSteps.map((s, idx) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => openStep(s)}
                  activeOpacity={0.7}
                  style={twStyle(
                    `flex-row items-center gap-4 py-3.5 ${idx === 0 ? "" : "border-t border-slate-50"}`,
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.completed ? "Completed" : "Open"} ${s.title}`}
                  accessibilityState={{ selected: s.completed }}
                >
                  <View
                    style={twStyle(
                      `h-10 w-10 items-center justify-center rounded-full ${
                        s.completed ? "bg-emerald-50" : "bg-primary/10"
                      }`,
                    )}
                  >
                    {s.completed ? (
                      <Ionicons name="checkmark" size={20} color="#10b981" />
                    ) : (
                      <Text style={twStyle("text-[15px] font-bold text-primary")}>{idx + 1}</Text>
                    )}
                  </View>
                  <Text
                    style={twStyle(
                      `flex-1 text-[16px] font-semibold ${
                        s.completed ? "text-slate-500" : "text-slate-900"
                      }`,
                    )}
                  >
                    {s.title}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={s.completed ? "#cbd5e1" : "#94a3b8"}
                  />
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
                <Ionicons name="star-outline" size={16} color={Colors.primary} />
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
                      "h-10 w-10 items-center justify-center rounded-full bg-primary/10",
                    )}
                  >
                    <Ionicons name="add" size={18} color={Colors.primary} />
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
                twStyle("mb-4 items-center rounded-full bg-primary py-4.5"),
                Shadows.card,
              ]}
              activeOpacity={0.88}
              accessibilityLabel={hasSetupSteps ? "Continue setup wizard" : "Start full setup wizard"}
              accessibilityRole="button"
            >
              <View style={twStyle("flex-row items-center gap-2")}>
                <Ionicons name="rocket-outline" size={20} color="#fff" />
                <Text style={twStyle("text-[16px] font-semibold text-white")}>
                  {hasSetupSteps ? "Continue setup" : "Start business setup"}
                </Text>
              </View>
              <Text style={twStyle("mt-1 px-6 text-center text-[13px] text-slate-300")}>
                {hasSetupSteps
                  ? "Pick up where you left off"
                  : "Walks you through every step end-to-end"}
              </Text>
            </TouchableOpacity>
          )}

          {!isComplete && hasSetupSteps ? (
            <TouchableOpacity
              onPress={goToApp}
              style={twStyle(
                "mb-4 items-center rounded-full border-2 border-slate-200 bg-white py-4",
              )}
              activeOpacity={0.85}
              accessibilityLabel="Go to dashboard"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[15px] font-semibold text-slate-700")}>Go to dashboard</Text>
            </TouchableOpacity>
          ) : null}

          {!isComplete && (
            <TouchableOpacity
              onPress={confirmSignOut}
              style={twStyle(
                "items-center rounded-full border-2 border-slate-200 bg-white py-4",
              )}
              activeOpacity={0.85}
              accessibilityLabel="Sign out"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[15px] font-semibold text-slate-700")}>
                Sign out
              </Text>
            </TouchableOpacity>
          )}

          {isComplete ? (
            <TouchableOpacity
              onPress={goToApp}
              style={twStyle("items-center rounded-full bg-primary py-4.5 shadow-sm")}
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
