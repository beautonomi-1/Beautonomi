/**
 * Setup status – onboarding completion and steps.
 * GET /api/provider/setup-status
 * Step links from API are web paths; we open native screens where they exist, else in-app browser.
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { twStyle } from "@/lib/twStyle";
import { APP_URL } from "@/config/public-env";

/** Map API step link (web path) to native app route when we have a native screen. */
const WEB_PATH_TO_NATIVE: Record<string, string> = {
  "/provider/settings/appointment-activity/business-details": "/(app)/(tabs)/more/settings/business",
  "/provider/settings/locations": "/(app)/(tabs)/more/locations",
  "/provider/settings/gallery": "/(app)/(tabs)/more/gallery",
  "/provider/settings/operating-hours": "/(app)/(tabs)/more/settings-operating-hours",
  "/provider/settings/verification": "/(app)/(tabs)/more/settings/verification",
  "/provider/settings/sales/yoco-integration": "/(app)/(tabs)/more/settings/yoco-devices",
  "/provider/settings/payout-accounts": "/(app)/(tabs)/more/settings/payout-accounts",
  "/provider/catalogue/services": "/(app)/(tabs)/more/catalogue",
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
  const { data: status, loading, refresh } = useApi<SetupStatus>(
    "/api/provider/setup-status"
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  function openStep(step: SetupStep) {
    const nativeRoute = step.link.startsWith("http")
      ? undefined
      : WEB_PATH_TO_NATIVE[step.link];
    if (nativeRoute) {
      router.push(nativeRoute as never);
      return;
    }
    const url =
      step.link.startsWith("http")
        ? step.link
        : `${(APP_URL || "").replace(/\/$/, "")}${step.link.startsWith("/") ? "" : "/"}${step.link}`;
    router.push({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: {
        url: encodeURIComponent(url),
        title: step.title || "Setup",
      },
    } as never);
  }

  if (loading && !status) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading setup status..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Setup status" showBack subtitle="Complete your profile" />

      {status && (
        <>
          <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4")}>
            <View style={twStyle("flex-row items-center justify-between")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>
                {status.isComplete ? "All set!" : "Complete your setup"}
              </Text>
              <View style={twStyle("rounded-full bg-indigo-100 px-3 py-1")}>
                <Text style={twStyle("text-sm font-medium text-indigo-700")}>
                  {status.completionPercentage}%
                </Text>
              </View>
            </View>
            <View style={twStyle("mt-2 h-2 w-full overflow-hidden rounded-full bg-indigo-100")}>
              <View
                style={[twStyle("h-full bg-indigo-600"), { width: `${status.completionPercentage}%` }]}
              />
            </View>
          </View>

          <SectionHeader title="Steps" />
          <View>
            {(status.steps ?? []).map((step, stepIdx) => {
              const isComplete = step.completed;
              const isRequiredIncomplete = !step.completed && step.required;
              const iconName = isComplete
                ? "checkmark-circle"
                : isRequiredIncomplete
                  ? "close-circle"
                  : "ellipse-outline";
              const iconColor = isComplete ? "#22c55e" : isRequiredIncomplete ? "#ef4444" : "#9ca3af";
              const bgCircle = isComplete ? "bg-green-100" : isRequiredIncomplete ? "bg-red-50" : "bg-gray-100";
              const borderStyle = isComplete
                ? "border-green-100 bg-green-50/50"
                : isRequiredIncomplete
                  ? "border-red-100 bg-red-50/30"
                  : "border-gray-100 bg-white";
              return (
                <TouchableOpacity
                  key={step.id}
                  style={[twStyle(`flex-row items-center rounded-xl border p-4 ${borderStyle}`), stepIdx > 0 ? { marginTop: 8 } : undefined]}
                  onPress={() => openStep(step)}
                >
                  <View style={twStyle(`h-10 w-10 items-center justify-center rounded-full ${bgCircle}`)}>
                    <Ionicons name={iconName as any} size={22} color={iconColor} />
                  </View>
                  <View style={twStyle("ml-3 flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{step.title}</Text>
                    <Text style={twStyle("mt-0.5 text-sm text-gray-500")} numberOfLines={1}>
                      {step.description}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {status && (!status.steps || status.steps.length === 0) && (
        <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("text-sm text-gray-500")}>No setup steps available.</Text>
        </View>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
