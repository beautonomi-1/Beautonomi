import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type CustomRequest = {
  id: string;
  message?: string | null;
  status?: string | null;
  created_at: string;
  customer?: { full_name?: string | null; email?: string | null } | null;
  offers?: { status?: string; price?: number; created_at?: string }[];
};

export default function CustomRequestsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<CustomRequest[] | { data?: CustomRequest[] }>(
    "/api/provider/custom-requests"
  );

  const requests: CustomRequest[] = Array.isArray(data) ? data : (data as { data?: CustomRequest[] })?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Custom requests" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Custom requests" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Custom requests"
        subtitle="Client quotes & offers"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {requests.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="chatbox-ellipses-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No custom requests yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Client requests will appear here
            </Text>
          </View>
        ) : (
          <View className="pb-4">
            {requests.map((r) => (
              <View
                key={r.id}
                className="mb-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <Text className="font-semibold text-gray-900" numberOfLines={1}>
                  {r.customer?.full_name ?? "Customer"}
                </Text>
                {r.message ? (
                  <Text className="mt-1 text-sm text-gray-600" numberOfLines={2}>
                    {r.message}
                  </Text>
                ) : null}
                <Text className="mt-2 text-xs text-gray-500">
                  {new Date(r.created_at).toLocaleDateString()}
                  {r.offers?.length ? ` · ${r.offers.length} offer(s)` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
