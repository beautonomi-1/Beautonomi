/**
 * Setup status – onboarding completion checklist.
 * GET /api/provider/setup-status
 * Completion % is based on required steps only.
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";
import * as Haptics from "expo-haptics";

const WEB_PATH_TO_NATIVE: Record<string, string> = {
  "/provider/settings/appointment-activity/business-details":
    "/(app)/(tabs)/more/settings/business",
  "/provider/settings/locations": "/(app)/(tabs)/more/locations",
  "/provider/settings/gallery": "/(app)/(tabs)/more/gallery",
  "/provider/settings/operating-hours":
    "/(app)/(tabs)/more/settings-operating-hours",
  "/provider/settings/verification":
    "/(app)/(tabs)/more/settings/verification",
  "/provider/settings/sales/yoco-integration":
    "/(app)/(tabs)/more/settings/yoco-devices",
  "/provider/settings/payout-accounts":
    "/(app)/(tabs)/more/settings/payout-accounts",
  "/provider/catalogue/services": "/(app)/(tabs)/more/catalogue",
  "/profile/create-profile": "/(app)/onboarding/wizard",
  "/provider/subscription": "/(app)/(tabs)/more/settings/subscription",
  "/provider/settings/subscription":
    "/(app)/(tabs)/more/settings/subscription",
  "/provider/settings/payments": "/(app)/(tabs)/more/settings/payments",
  "/provider/settings/online-booking":
    "/(app)/(tabs)/more/settings/online-booking",
  "/provider/settings/booking-link":
    "/(app)/(tabs)/more/settings/booking-link",
  "/provider/team": "/(app)/(tabs)/more/team-list",
  "/provider/staff": "/(app)/(tabs)/more/team-list",
};

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  link: string;
}

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: SetupStep[];
}

export default function SetupStatusScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data: status, loading, refresh } =
    useApi<SetupStatus>("/api/provider/setup-status");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  function openStep(step: SetupStep) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nativeRoute = WEB_PATH_TO_NATIVE[step.link];
    if (nativeRoute) {
      router.push(nativeRoute as never);
      return;
    }
    Alert.alert(
      "Open in setup wizard",
      "This step is available in the quick setup wizard.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open wizard",
          onPress: () =>
            router.push("/(app)/onboarding/wizard" as never),
        },
      ]
    );
  }

  if (loading && !status) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading setup status…" />
      </ScreenContainer>
    );
  }

  const steps = status?.steps ?? [];
  const requiredSteps = steps.filter((s) => s.required);
  const completedRequired = requiredSteps.filter((s) => s.completed).length;
  const optionalSteps = steps.filter((s) => !s.required);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Setup checklist"
        showBack
        subtitle="Steps to start accepting bookings"
      />

      {status && (
        <>
          {/* ── Progress card ──────────────────────────────── */}
          <View
            style={twStyle(
              `mb-5 rounded-2xl border p-5 ${
                status.isComplete
                  ? "border-green-200 bg-green-50"
                  : "border-gray-100 bg-white"
              }`
            )}
          >
            <View style={twStyle("flex-row items-center justify-between mb-3")}>
              <View style={twStyle("flex-1 pr-4")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {status.isComplete
                    ? "You're ready to go! 🎉"
                    : "Complete your setup"}
                </Text>
                <Text style={twStyle("mt-1 text-sm text-gray-500")}>
                  {status.isComplete
                    ? "Your profile is live. You can now accept bookings."
                    : `${completedRequired} of ${requiredSteps.length} required steps done`}
                </Text>
              </View>
              <View
                style={[
                  twStyle("rounded-full px-3 py-1.5"),
                  {
                    backgroundColor: status.isComplete
                      ? "#dcfce7"
                      : "#f3f4f6",
                  },
                ]}
              >
                <Text
                  style={[
                    twStyle("text-sm font-bold"),
                    {
                      color: status.isComplete ? "#166534" : "#374151",
                    },
                  ]}
                >
                  {status.completionPercentage}%
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View
              style={twStyle(
                "h-2 w-full overflow-hidden rounded-full bg-gray-100"
              )}
            >
              <View
                style={[
                  twStyle("h-full rounded-full"),
                  {
                    width: `${status.completionPercentage}%`,
                    backgroundColor: status.isComplete
                      ? "#22c55e"
                      : Colors.primary,
                  },
                ]}
              />
            </View>
          </View>

          {/* ── Quick wizard CTA ───────────────────────────── */}
          {!status.isComplete && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(app)/onboarding/wizard" as never);
              }}
              style={twStyle(
                "mb-5 flex-row items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4"
              )}
              accessibilityRole="button"
              accessibilityLabel="Open quick setup wizard"
            >
              <View
                style={twStyle(
                  "h-10 w-10 items-center justify-center rounded-xl bg-primary/10"
                )}
              >
                <Ionicons
                  name="rocket-outline"
                  size={20}
                  color={Colors.primary}
                />
              </View>
              <View style={twStyle("flex-1")}>
                <Text
                  style={twStyle("text-sm font-semibold text-gray-900")}
                >
                  Quick setup wizard
                </Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                  Complete everything in one guided flow
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color="#9ca3af"
              />
            </TouchableOpacity>
          )}

          {/* ── Required steps ────────────────────────────── */}
          {requiredSteps.length > 0 && (
            <>
              <Text
                style={twStyle(
                  "mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
                )}
              >
                Required
              </Text>
              <View style={twStyle("gap-2 mb-5")}>
                {requiredSteps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    onPress={() => openStep(step)}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── Optional steps ────────────────────────────── */}
          {optionalSteps.length > 0 && (
            <>
              <Text
                style={twStyle(
                  "mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
                )}
              >
                Boost your profile
              </Text>
              <View style={twStyle("gap-2")}>
                {optionalSteps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    onPress={() => openStep(step)}
                    isOptional
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}

      {status && steps.length === 0 && (
        <View
          style={twStyle(
            "rounded-2xl border border-gray-100 bg-white p-5 items-center"
          )}
        >
          <Text style={twStyle("text-sm text-gray-500 text-center")}>
            No setup steps found. Complete onboarding first.
          </Text>
        </View>
      )}

      <View style={twStyle("h-10")} />
    </ScreenContainer>
  );
}

function StepRow({
  step,
  onPress,
  isOptional = false,
}: {
  step: SetupStep;
  onPress: () => void;
  isOptional?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={step.title}
      style={[
        twStyle(
          `flex-row items-center rounded-2xl border p-4 ${
            step.completed
              ? "border-green-100 bg-green-50/40"
              : isOptional
              ? "border-gray-100 bg-white"
              : "border-gray-100 bg-white"
          }`
        ),
      ]}
    >
      {/* Icon */}
      <View
        style={[
          twStyle(
            "h-9 w-9 items-center justify-center rounded-full mr-3"
          ),
          {
            backgroundColor: step.completed
              ? "#dcfce7"
              : isOptional
              ? "#f3f4f6"
              : "#ede9fe",
          },
        ]}
      >
        <Ionicons
          name={step.completed ? "checkmark" : "ellipse-outline"}
          size={16}
          color={
            step.completed
              ? "#16a34a"
              : isOptional
              ? "#9ca3af"
              : Colors.primary
          }
        />
      </View>

      {/* Text */}
      <View style={twStyle("flex-1")}>
        <Text
          style={[
            twStyle("text-sm font-semibold"),
            {
              color: step.completed ? "#6b7280" : "#111827",
              textDecorationLine: step.completed ? "line-through" : "none",
            },
          ]}
        >
          {step.title}
        </Text>
        <Text
          style={twStyle("mt-0.5 text-xs text-gray-400")}
          numberOfLines={1}
        >
          {step.description}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={14} color="#d1d5db" />
    </TouchableOpacity>
  );
}
