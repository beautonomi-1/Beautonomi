/**
 * Locations list – GET /api/provider/locations. Add → locations/add, tap row → locations/[id].
 */
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type LocationItem = {
  id: string;
  name: string;
  address_line1?: string;
  city?: string;
  country?: string;
  is_primary?: boolean;
  is_active?: boolean;
};

export default function LocationsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<LocationItem[]>("/api/provider/locations");

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const locations: LocationItem[] = Array.isArray(data) ? data : [];

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Locations" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Locations" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Locations"
        subtitle="Business addresses and service areas"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/locations/add" as never);
            }}
            className="rounded-full bg-gray-100 p-2"
            accessibilityLabel="Add location"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color="#374151" />
          </TouchableOpacity>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4">
          {locations.length === 0 ? (
            <View className="py-12 items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-teal-50 mb-4">
                <Ionicons name="location-outline" size={32} color="#0d9488" />
              </View>
              <Text className="text-center text-gray-600">No locations yet</Text>
              <Text className="mt-2 text-center text-sm text-gray-500 mb-6">
                Add your first business address so clients can find you.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/locations/add" as never)}
                className="rounded-xl bg-teal-600 px-6 py-3"
                activeOpacity={0.8}
              >
                <Text className="font-semibold text-white">Add location</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="gap-3">
              {locations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(app)/(tabs)/more/locations/${loc.id}` as never);
                  }}
                  activeOpacity={0.7}
                  className="rounded-2xl border border-gray-200 bg-white p-4"
                  accessibilityRole="button"
                  accessibilityLabel={`${loc.name}, ${loc.city ?? ""} ${loc.country ?? ""}`}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-base font-semibold text-gray-900">{loc.name}</Text>
                        {loc.is_primary && (
                          <View className="rounded bg-teal-100 px-2 py-0.5">
                            <Text className="text-xs font-medium text-teal-800">Primary</Text>
                          </View>
                        )}
                      </View>
                      {(loc.address_line1 || loc.city || loc.country) && (
                        <Text className="mt-1 text-sm text-gray-500" numberOfLines={2}>
                          {[loc.address_line1, loc.city, loc.country].filter(Boolean).join(", ")}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/locations/add" as never)}
                className="flex-row items-center justify-center rounded-2xl border border-dashed border-gray-300 py-4"
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={22} color="#0d9488" />
                <Text className="ml-2 font-medium text-teal-700">Add another location</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
