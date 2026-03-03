import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

export interface BusinessSettings {
  id: string;
  business_name: string;
  business_type: string;
  email: string;
  phone: string;
  description: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

/** Content-only for use in Settings hub tab. Lives in _components so it is not a route. */
export function SettingsBusinessContent() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<BusinessSettings>(
    "/api/provider/settings/business"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

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
  const business = data!;
  const addressParts = [
    business.address_line1,
    business.city,
    business.state,
    business.postal_code,
    business.country,
  ].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <Ionicons name="settings-outline" size={32} color="#6b7280" />
      </View>
      <Text className="text-lg font-semibold text-gray-900">Business</Text>
      <Text className="mt-2 text-sm text-gray-600">
        Your business details. Edit locations, hours, and more in the provider portal when needed.
      </Text>

      <View className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
        <View className="mb-3">
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Business name
          </Text>
          <Text className="mt-1 text-base font-medium text-gray-900">
            {business.business_name || "—"}
          </Text>
        </View>
        {business.business_type ? (
          <View className="mb-3">
            <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Type
            </Text>
            <Text className="mt-1 text-sm text-gray-800 capitalize">
              {business.business_type.replace("_", " ")}
            </Text>
          </View>
        ) : null}
        {business.email ? (
          <View className="mb-3">
            <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Email
            </Text>
            <Text className="mt-1 text-sm text-gray-800">{business.email}</Text>
          </View>
        ) : null}
        {business.phone ? (
          <View className="mb-3">
            <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Phone
            </Text>
            <Text className="mt-1 text-sm text-gray-800">{business.phone}</Text>
          </View>
        ) : null}
        {address ? (
          <View>
            <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Address
            </Text>
            <Text className="mt-1 text-sm text-gray-800">{address}</Text>
          </View>
        ) : null}
      </View>

      <View className="mt-4 rounded-xl bg-gray-50 p-3">
        <Text className="text-sm text-gray-600">
          To update locations, operating hours, online booking, team permissions, or notifications,
          use the provider portal on the web.
        </Text>
      </View>
    </ScrollView>
  );
}
