import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  total_recipients: number;
  sent_count?: number;
  scheduled_at?: string | null;
  sent_at?: string | null;
  created_at: string;
}

interface CampaignsResponse {
  items: Campaign[];
  total: number;
  page: number;
  limit: number;
}

/** Content-only for use in Marketing hub (Campaigns tab). */
export function MarketingCampaignsContent() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<CampaignsResponse>(
    "/api/provider/campaigns?limit=50"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const campaigns: Campaign[] = data?.items ?? [];
  const total = data?.total ?? campaigns.length;

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {campaigns.length === 0 ? (
          <View className="items-center rounded-2xl border border-gray-100 bg-gray-50/50 p-8">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <Ionicons name="megaphone-outline" size={32} color="#ef4444" />
            </View>
            <Text className="text-center font-semibold text-gray-900">No campaigns yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Create email, SMS or WhatsApp campaigns to reach your clients. Use the provider portal to build and send campaigns with segments and scheduling.
            </Text>
          </View>
        ) : (
          <>
            <Text className="mb-3 text-sm text-gray-500">
              {total} campaign{total !== 1 ? "s" : ""}
            </Text>
            {campaigns.map((c) => (
              <View
                key={c.id}
                className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
              >
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                  <Ionicons
                    name={c.type === "email" ? "mail-outline" : c.type === "sms" ? "chatbox-outline" : "logo-whatsapp"}
                    size={20}
                    color="#ef4444"
                  />
                </View>
                <View className="ml-3 flex-1 min-w-0">
                  <Text className="font-semibold text-gray-900" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text className="mt-0.5 text-sm text-gray-600">
                    {c.type} · {c.status}
                  </Text>
                  <Text className="mt-0.5 text-xs text-gray-500">
                    {c.sent_at
                      ? `Sent ${new Date(c.sent_at).toLocaleDateString()}`
                      : c.scheduled_at
                        ? `Scheduled ${new Date(c.scheduled_at).toLocaleDateString()}`
                        : `${c.total_recipients} recipients`}
                  </Text>
                </View>
                <View
                  className={`rounded-full px-2.5 py-1 ${
                    c.status === "sent" ? "bg-green-100" : c.status === "draft" ? "bg-gray-100" : "bg-amber-100"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      c.status === "sent" ? "text-green-800" : c.status === "draft" ? "text-gray-700" : "text-amber-800"
                    }`}
                  >
                    {c.status}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
  );
}

export default function MarketingScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Marketing" showBack subtitle="Campaigns & automation" />
      <MarketingCampaignsContent />
    </ScreenContainer>
  );
}
