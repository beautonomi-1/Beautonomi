/**
 * Identity verification (KYC) – view status and start verification in-app.
 * Status from API; verification flow runs in in-app browser (Sumsub on web).
 */
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";

type VerificationStatus = "pending" | "in_progress" | "approved" | "rejected" | "reset";

interface VerificationStatusResponse {
  status: VerificationStatus;
  sumsub_applicant_id?: string | null;
  last_reviewed_at?: string | null;
  updated_at?: string | null;
}

const STATUS_CONFIG: Record<
  VerificationStatus,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  pending: {
    label: "Not started",
    icon: "time-outline",
    color: "#6b7280",
    bg: "bg-gray-100",
  },
  in_progress: {
    label: "In progress",
    icon: "hourglass-outline",
    color: "#f59e0b",
    bg: "bg-amber-100",
  },
  approved: {
    label: "Verified",
    icon: "checkmark-circle",
    color: "#22c55e",
    bg: "bg-green-100",
  },
  rejected: {
    label: "Rejected",
    icon: "close-circle",
    color: "#ef4444",
    bg: "bg-red-100",
  },
  reset: {
    label: "Reset",
    icon: "refresh-outline",
    color: "#6366f1",
    bg: "bg-indigo-100",
  },
};

export default function VerificationScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<VerificationStatusResponse>(
    "/api/provider/verification/status"
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const status = (data as VerificationStatusResponse)?.status ?? "pending";
  const config = STATUS_CONFIG[status];

  const openVerificationInBrowser = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const baseUrl = getWebProviderBaseUrl();
    const url = `${baseUrl.replace(/\/$/, "")}/provider/settings/verification`;
    const encoded = encodeURIComponent(url);
    router.push({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: { url: encoded, title: "Identity verification" },
    } as never);
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Identity verification" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Identity verification" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Identity verification"
        subtitle="Required for payouts"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 pt-6">
          <View className={`rounded-2xl p-6 items-center ${config.bg}`}>
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: `${config.color}30` }}
            >
              <Ionicons name={config.icon} size={32} color={config.color} />
            </View>
            <Text className="text-lg font-semibold text-gray-900">{config.label}</Text>
            <Text className="mt-2 text-center text-gray-600">
              {status === "approved"
                ? "Your identity is verified. You can receive payouts."
                : status === "rejected"
                  ? "Verification was not approved. You can try again or contact support."
                  : status === "in_progress"
                    ? "Complete the steps in the verification flow to finish."
                    : "Verify your identity to receive payouts. You’ll need an ID and a selfie."}
            </Text>
          </View>

          {(status === "pending" || status === "in_progress" || status === "rejected" || status === "reset") && (
            <View className="mt-6">
              <ActionButton
                label={status === "pending" || status === "rejected" || status === "reset" ? "Start verification" : "Continue verification"}
                variant="secondary"
                onPress={openVerificationInBrowser}
                fullWidth
                icon="open-outline"
                iconPosition="right"
              />
              <Text className="mt-3 text-center text-sm text-gray-500">
                Opens the verification flow in-app. You’ll stay inside the app.
              </Text>
            </View>
          )}

          <View className="mt-8 rounded-2xl bg-slate-50 p-4">
            <View className="flex-row items-center mb-2">
              <Ionicons name="shield-checkmark-outline" size={18} color="#475569" />
              <Text className="ml-2 text-sm font-semibold text-gray-700">Why we verify</Text>
            </View>
            <Text className="text-sm text-gray-600 leading-5">
              Identity verification helps us prevent fraud and meet regulatory requirements. Your information is processed securely by our verification partner.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
