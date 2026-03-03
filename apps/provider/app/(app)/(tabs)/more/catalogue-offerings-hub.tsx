import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Service = {
  id: string;
  title: string;
  description?: string | null;
  price?: number;
  duration_minutes?: number;
  provider_categories?: { name?: string } | null;
};

export default function CatalogueOfferingsHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Service[] | { data?: Service[] }>(
    "/api/provider/services"
  );

  const services: Service[] = Array.isArray(data) ? data : (data as { data?: Service[] })?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue & offerings" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Catalogue & offerings" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Catalogue & offerings"
        subtitle="Services, products & packages"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {services.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="layers-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No services yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500 mb-4">
              Add your first service in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/catalogue" as never)}
              className="rounded-xl bg-pink-600 px-6 py-3"
              activeOpacity={0.8}
            >
              <Text className="font-semibold text-white">Add service</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="pb-4">
            {services.map((s) => (
              <View
                key={s.id}
                className="mb-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <Text className="font-semibold text-gray-900">{s.title}</Text>
                {s.provider_categories?.name && (
                  <Text className="mt-0.5 text-xs text-gray-500">{s.provider_categories.name}</Text>
                )}
                <View className="mt-2 flex-row flex-wrap gap-3">
                  {typeof s.price === "number" && (
                    <Text className="text-sm font-medium text-gray-700">ZAR {s.price.toLocaleString()}</Text>
                  )}
                  {s.duration_minutes != null && (
                    <Text className="text-sm text-gray-500">{s.duration_minutes} min</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
