import { useEffect, useRef } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { playRingtone } from "@/lib/on-demand/ringtone";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { format } from "date-fns";

interface WaitingRoomEntry {
  id: string;
  client_name: string;
  client_phone?: string;
  service_name?: string;
  status: "waiting" | "in_service" | "completed" | "left";
  checked_in_time: string;
}

export default function WaitingRoomScreen() {
  useRouter();
  const onDemandConfig = useModuleConfig("on_demand");
  const prevWaitingCountRef = useRef<number | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);

  const { data: entries, loading, error, refresh } = useApi<WaitingRoomEntry[]>(
    "/api/provider/waiting-room"
  );

  useEffect(() => {
    return () => {
      ringtoneStopRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (entries == null) return;
    const waitingCount = entries.filter((e) => e.status === "waiting").length;
    if (
      onDemandConfig.enabled &&
      onDemandConfig.ringtone_asset_path &&
      prevWaitingCountRef.current !== null &&
      waitingCount > prevWaitingCountRef.current
    ) {
      ringtoneStopRef.current?.();
      playRingtone(onDemandConfig).then((ctrl) => {
        ringtoneStopRef.current = ctrl.stop;
      });
    }
    prevWaitingCountRef.current = waitingCount;
  }, [entries, onDemandConfig]);

  const waitingList = (entries ?? []).filter((e) => e.status === "waiting");
  const inServiceList = (entries ?? []).filter((e) => e.status === "in_service");

  if (loading && !entries) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Front Desk" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !entries) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Front Desk" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Front Desk" showBack />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#1a1f3c" />
        }
      >
        <View className="mx-4 mb-4 flex-row gap-3">
          <View className="flex-1 rounded-xl border border-gray-100 bg-amber-50 p-3">
            <Text className="text-xs text-amber-700">Waiting</Text>
            <Text className="text-xl font-semibold text-amber-800">{waitingList.length}</Text>
          </View>
          <View className="flex-1 rounded-xl border border-gray-100 bg-blue-50 p-3">
            <Text className="text-xs text-blue-700">In service</Text>
            <Text className="text-xl font-semibold text-blue-800">{inServiceList.length}</Text>
          </View>
        </View>

        <View className="px-4">
          <Text className="mb-2 text-sm font-semibold text-gray-900">Waiting</Text>
          {waitingList.length === 0 ? (
            <View className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <Text className="text-center text-sm text-gray-500">No one waiting</Text>
            </View>
          ) : (
            waitingList.map((entry) => (
              <View
                key={entry.id}
                className="mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4"
              >
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                  <Ionicons name="person" size={20} color="#b45309" />
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">{entry.client_name}</Text>
                  {entry.service_name ? (
                    <Text className="text-xs text-gray-500">{entry.service_name}</Text>
                  ) : null}
                  <Text className="text-xs text-gray-400">
                    Checked in {format(new Date(entry.checked_in_time), "HH:mm")}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {inServiceList.length > 0 && (
          <View className="mt-6 px-4">
            <Text className="mb-2 text-sm font-semibold text-gray-900">In service</Text>
            {inServiceList.map((entry) => (
              <View
                key={entry.id}
                className="mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4"
              >
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <Ionicons name="person" size={20} color="#1d4ed8" />
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">{entry.client_name}</Text>
                  {entry.service_name ? (
                    <Text className="text-xs text-gray-500">{entry.service_name}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
