/**
 * Automations – list and manage marketing automations.
 * GET /api/provider/automations, PATCH/DELETE /api/provider/automations/[id]
 * Create new automations in the provider portal.
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList, Alert, Switch } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { twStyle } from "@/lib/twStyle";

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  is_active: boolean;
  is_template?: boolean;
  created_at?: string;
}

export default function AutomationsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data: automations, loading, error, refresh } = useApi<Automation[]>(
    "/api/provider/automations"
  );
  const { execute: updateAutomation } = useApiMutation("patch");
  const { execute: deleteAutomation } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  async function handleToggleActive(item: Automation) {
    if (item.is_template) return;
    const { error: err } = await updateAutomation(
      `/api/provider/automations/${item.id}`,
      { is_active: !item.is_active }
    );
    if (err) Alert.alert("Error", err);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  function handleDelete(item: Automation) {
    if (item.is_template) return;
    Alert.alert(
      "Delete automation",
      `Remove "${item.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error: err } = await deleteAutomation(
              `/api/provider/automations/${item.id}`
            );
            if (err) Alert.alert("Error", err);
            else refresh();
          },
        },
      ]
    );
  }

  const list = automations?.filter((a) => !a.is_template) ?? [];

  if (loading && !automations) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading automations..." />
      </ScreenContainer>
    );
  }

  if (error && !automations) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Automations" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Automations"
        showBack
        subtitle="Marketing & follow-ups"
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/settings/automations-create" as never);
            }}
            style={twStyle("flex-row items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2")}
          >
            <Ionicons name="add" size={16} color="#4338ca" style={{ marginRight: 6 }} />
            <Text style={twStyle("text-sm font-semibold text-indigo-800")}>Create</Text>
          </TouchableOpacity>
        }
      />
      <SectionHeader title="Your automations" />
      {list.length === 0 ? (
        <EmptyState
          icon="flash-outline"
          title="No automations"
          description="Create automations in the provider portal to send follow-ups and marketing messages."
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(a: Automation) => a.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }: { item: Automation }) => (
            <View style={twStyle("mb-2 flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white p-4")}>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("font-medium text-gray-900")}>{item.name}</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                  {item.trigger_type} → {item.action_type}
                </Text>
              </View>
              <Switch
                value={item.is_active}
                onValueChange={() => handleToggleActive(item)}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
              />
              <TouchableOpacity
                style={twStyle("ml-2 p-2")}
                onPress={() => handleDelete(item)}
              >
                <Ionicons name="trash-outline" size={20} color="#dc2626" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
