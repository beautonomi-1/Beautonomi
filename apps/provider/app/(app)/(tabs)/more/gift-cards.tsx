import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface GiftCardSettings {
  enabled: boolean;
  terms: string | null;
  isUsingPlatformDefault: boolean;
}

export default function GiftCardsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<GiftCardSettings>(
    "/api/provider/settings/sales/gift-cards"
  );
  const { execute: updateSettings, loading: saving } = useApiMutation<GiftCardSettings>("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleToggle = useCallback(
    async (value: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error: err } = await updateSettings(
        "/api/provider/settings/sales/gift-cards",
        { gift_cards_enabled: value }
      );
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    },
    [updateSettings, refresh]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Gift Cards" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Gift Cards" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const settings = data!;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Gift Cards" showBack />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-6 h-16 w-16 items-center justify-center rounded-full bg-purple-50">
          <Ionicons name="gift-outline" size={32} color="#a855f7" />
        </View>
        <Text className="text-lg font-semibold text-gray-900">Accept platform gift cards</Text>
        <Text className="mt-2 text-sm text-gray-600">
          Gift cards are sold by the platform. Customers buy them on the website and can use them
          with any provider who has this turned on.
        </Text>

        <View className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 font-medium text-gray-900">
              Accept gift cards as payment
            </Text>
            <Switch
              value={settings.enabled}
              onValueChange={handleToggle}
              disabled={saving}
              trackColor={{ false: "#d1d5db", true: "#a855f7" }}
              thumbColor="#fff"
            />
          </View>
          {saving && (
            <Text className="mt-2 text-xs text-gray-500">Saving…</Text>
          )}
        </View>

        {settings.terms ? (
          <View className="mt-4 rounded-xl bg-gray-50 p-3">
            <Text className="text-xs font-medium text-gray-500">Terms</Text>
            <Text className="mt-1 text-sm text-gray-700">{settings.terms}</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
