import { useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert, DeviceEventEmitter } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
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
import {
  GUIDED_WIZARD_ROUTE,
  resolveNextIncompleteRoute,
  resolveSetupStepRoute,
  type SetupNavStep,
} from "@/lib/setup-step-navigation";
import { PROVIDER_SETUP_STATUS_CHANGED } from "@/lib/setup-status-cache";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

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
  const { t } = useTranslation();
  const oh = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.onboardingHub.${key}`, opts) as string,
    [t],
  );
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
      if (!dismissed) await setBiometricPromptPending(uid);
    }
    router.replace("/(app)/(tabs)" as never);
  };

  const startNativeWizard = () => {
    hapticLight();
    const target = resolveNextIncompleteRoute(allSteps as SetupNavStep[]);
    router.push(target as never);
  };

  const openGuidedWizard = () => {
    hapticLight();
    router.push(GUIDED_WIZARD_ROUTE as never);
  };

  const confirmSignOut = () => {
    hapticLight();
    Alert.alert(
      oh("signOutTitle"),
      oh("signOutBody"),
      [
        { text: oh("cancel"), style: "cancel" },
        {
          text: oh("signOut"),
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
    const target = resolveSetupStepRoute(step);
    try {
      router.push(target as never);
    } catch (err) {
      console.warn("Setup step navigation failed, falling back:", err);
      try {
        router.push(resolveSetupStepRoute(step) as never);
      } catch {
        router.push(GUIDED_WIZARD_ROUTE as never);
      }
    }
  };

  // Refresh on focus so completing a step elsewhere updates the hub immediately.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_SETUP_STATUS_CHANGED, () => {
      void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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
        <ScreenHeader title={oh("title")} showBack={false} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const previewKeys = ["previewBusinessDetails", "previewServices", "previewPayment"] as const;

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
            title={oh("title")}
            showBack={false}
            subtitle={
              isComplete
                ? isPendingApproval
                  ? oh("subtitleCompleteReview")
                  : oh("subtitleComplete")
                : hasSetupSteps
                  ? oh("subtitleInProgress")
                  : oh("subtitleStart")
            }
            rightAction={
              isComplete ? (
                <TouchableOpacity
                  onPress={goToApp}
                  style={twStyle(
                    "flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm",
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={oh("goToDashboardA11y")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="home-outline" size={14} color="#334155" />
                  <Text style={twStyle("text-[12px] font-semibold text-slate-700")}>{oh("dashboard")}</Text>
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
                    ? oh("badgeSuspended")
                    : isPendingApproval
                      ? oh("badgeUnderReview")
                      : oh("badgeReady")
                  : isSuspended
                    ? oh("badgeSuspended")
                    : oh("badgeGuided")}
              </Text>
            </View>
            <Text style={twStyle("text-center text-[24px] font-bold text-slate-900")}>
              {isComplete
                ? isSuspended
                  ? oh("headingSuspended")
                  : isPendingApproval
                    ? oh("headingComplete")
                    : oh("headingAllSet")
                : isSuspended
                  ? oh("headingSuspended")
                  : oh("headingWelcome")}
            </Text>
            <Text style={twStyle("mt-2 max-w-sm text-center text-[15px] leading-relaxed text-slate-500")}>
              {isComplete
                ? isSuspended
                  ? oh("bodyCompleteSuspended")
                  : isPendingApproval
                    ? oh("bodyCompleteReview")
                    : oh("bodyCompleteLive")
                : isSuspended
                  ? oh("bodySuspended")
                : !hasSetupSteps
                  ? oh("bodyNoSteps")
                : remaining > 0
                  ? oh("remainingSteps", { count: remaining })
                  : oh("bodyCompleteRequired")}
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
                    {oh("setupProfileTitle")}
                  </Text>
                  <Text style={twStyle("mt-1 text-[13px] leading-relaxed text-slate-500")}>
                    {oh("setupProfileBody")}
                  </Text>
                </View>
              </View>
              <View style={twStyle("gap-3")}>
                {previewKeys.map((key) => (
                  <View key={key} style={twStyle("flex-row items-center gap-3")}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
                    <Text style={twStyle("text-[14px] font-medium text-slate-700")}>{oh(key)}</Text>
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
                  {oh("requiredProgress", { completed: completedRequired, total: requiredSteps.length })}
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
                  {oh("requiredToGoLive")}
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
                  accessibilityLabel={s.completed ? oh("stepCompletedA11y", { title: s.title }) : oh("stepOpenA11y", { title: s.title })}
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
                  <DirectionalIcon
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
                  {oh("polishProfile")}
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
                  accessibilityLabel={oh("stepOpenA11y", { title: s.title })}
                >
                  <View
                    style={twStyle(
                      "h-10 w-10 items-center justify-center rounded-full bg-primary/10",
                    )}
                  >
                    <Ionicons name="add" size={18} color={Colors.primary} />
                  </View>
                  <Text style={twStyle("flex-1 text-[16px] font-medium text-slate-800")}>{s.title}</Text>
                  <DirectionalIcon name="chevron-forward" size={18} color="#cbd5e1" />
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
              accessibilityLabel={hasSetupSteps ? oh("continueSetupA11y") : oh("startSetupA11y")}
              accessibilityRole="button"
            >
              <View style={twStyle("flex-row items-center gap-2")}>
                <Ionicons name="rocket-outline" size={20} color="#fff" />
                <Text style={twStyle("text-[16px] font-semibold text-white")}>
                  {hasSetupSteps ? oh("continueSetup") : oh("startSetup")}
                </Text>
              </View>
              <Text style={twStyle("mt-1 px-6 text-center text-[13px] text-slate-300")}>
                {hasSetupSteps
                  ? oh("continueHint")
                  : oh("startHint")}
              </Text>
            </TouchableOpacity>
          )}

          {!isComplete && hasSetupSteps ? (
            <TouchableOpacity
              onPress={openGuidedWizard}
              style={twStyle("mb-4 items-center py-2")}
              activeOpacity={0.85}
              accessibilityLabel={oh("guidedWizardA11y")}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[14px] font-medium text-primary")}>
                {oh("guidedWizard")}
              </Text>
            </TouchableOpacity>
          ) : null}

          {!isComplete && hasSetupSteps ? (
            <TouchableOpacity
              onPress={goToApp}
              style={twStyle(
                "mb-4 items-center rounded-full border-2 border-slate-200 bg-white py-4",
              )}
              activeOpacity={0.85}
              accessibilityLabel={oh("goToDashboardA11y")}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[15px] font-semibold text-slate-700")}>{oh("goToDashboard")}</Text>
            </TouchableOpacity>
          ) : null}

          {!isComplete && (
            <TouchableOpacity
              onPress={confirmSignOut}
              style={twStyle(
                "items-center rounded-full border-2 border-slate-200 bg-white py-4",
              )}
              activeOpacity={0.85}
              accessibilityLabel={oh("signOutA11y")}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[15px] font-semibold text-slate-700")}>
                {oh("signOut")}
              </Text>
            </TouchableOpacity>
          )}

          {isComplete ? (
            <TouchableOpacity
              onPress={goToApp}
              style={twStyle("items-center rounded-full bg-primary py-4.5 shadow-sm")}
              activeOpacity={0.88}
              accessibilityLabel={oh("goToDashboardA11y")}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-[16px] font-semibold text-white")}>{oh("goToDashboard")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </ScreenContainer>
  );
}
