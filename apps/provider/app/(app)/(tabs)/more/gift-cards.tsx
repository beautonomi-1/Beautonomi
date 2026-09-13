import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Switch, Alert } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface GiftCardSettings {
  enabled: boolean;
  terms: string | null;
  isUsingPlatformDefault: boolean;
}

export default function GiftCardsScreen() {
  const { t } = useTranslation();
  const gc = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.giftCards." + key, opts) as string,
    [t],
  );
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<GiftCardSettings>(
    "/api/provider/settings/sales/gift-cards"
  );
  const { execute: updateSettings, loading: saving } = useApiMutation<GiftCardSettings>("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleToggle = useCallback(
    async (value: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error: err } = await updateSettings(
        "/api/provider/settings/sales/gift-cards",
        { gift_cards_enabled: value }
      );
      if (err) {
        Alert.alert(gc("errorTitle"), err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    },
    [updateSettings, refresh, gc]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={gc("title")} showBack />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={gc("title")} showBack />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const settings = data!;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={gc("title")} showBack />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-6 h-16 w-16 items-center justify-center rounded-full bg-purple-50")}>
          <Ionicons name="gift-outline" size={32} color="#a855f7" />
        </View>
        <Text style={twStyle("text-lg font-semibold text-gray-900")}>{gc("acceptTitle")}</Text>
        <Text style={twStyle("mt-2 text-sm text-gray-600")}>
          {gc("acceptBody")}
        </Text>

        <View style={twStyle("mt-6 rounded-2xl border border-gray-200 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <Text style={twStyle("flex-1 font-medium text-gray-900")}>
              {gc("acceptToggle")}
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
            <Text style={twStyle("mt-2 text-xs text-gray-500")}>{gc("saving")}</Text>
          )}
        </View>

        {settings.terms ? (
          <View style={twStyle("mt-4 rounded-xl bg-gray-50 p-3")}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>{gc("terms")}</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-700")}>{settings.terms}</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
