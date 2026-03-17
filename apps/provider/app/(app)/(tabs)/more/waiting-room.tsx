import { useEffect, useRef } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { playRingtone } from "@/lib/on-demand/ringtone";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { format } from "date-fns";
import { twStyle } from "@/lib/twStyle";

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
  const { isTablet } = useResponsive();
  const { selectedLocationId } = useProvider();
  const onDemandConfig = useModuleConfig("on_demand");
  const prevWaitingCountRef = useRef<number | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);

  const waitingRoomUrl = selectedLocationId
    ? `/api/provider/waiting-room?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/waiting-room";
  const { data: entries, loading, error, refresh } = useApi<WaitingRoomEntry[]>(
    waitingRoomUrl
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
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !entries) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Front Desk" showBack />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Front Desk" showBack />

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#1a1f3c" />
        }
      >
        <View style={twStyle("mx-4 mb-4 flex-row")}>
          <View style={[twStyle("flex-1 rounded-xl border border-gray-100 bg-amber-50 p-3"), { marginRight: 12 }]}>
            <Text style={twStyle("text-xs text-amber-700")}>Waiting</Text>
            <Text style={twStyle("text-xl font-semibold text-amber-800")}>{waitingList.length}</Text>
          </View>
          <View style={twStyle("flex-1 rounded-xl border border-gray-100 bg-blue-50 p-3")}>
            <Text style={twStyle("text-xs text-blue-700")}>In service</Text>
            <Text style={twStyle("text-xl font-semibold text-blue-800")}>{inServiceList.length}</Text>
          </View>
        </View>

        <View style={twStyle(isTablet ? "flex-row px-4" : "px-4")}>
          <View style={twStyle(isTablet ? "flex-1 pr-2" : "")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Waiting</Text>
            {waitingList.length === 0 ? (
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
                <Text style={twStyle("text-center text-sm text-gray-500")}>No one waiting</Text>
              </View>
            ) : (
              waitingList.map((entry) => (
                <View
                  key={entry.id}
                  style={twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4")}
                >
                  <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-amber-100")}>
                    <Ionicons name="person" size={20} color="#b45309" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{entry.client_name}</Text>
                    {entry.service_name ? (
                      <Text style={twStyle("text-xs text-gray-500")}>{entry.service_name}</Text>
                    ) : null}
                    <Text style={twStyle("text-xs text-gray-400")}>
                      Checked in {format(new Date(entry.checked_in_time), "HH:mm")}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={twStyle(isTablet ? "flex-1 pl-2" : "mt-6")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>In service</Text>
            {inServiceList.length === 0 ? (
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
                <Text style={twStyle("text-center text-sm text-gray-500")}>No one in service</Text>
              </View>
            ) : (
              inServiceList.map((entry) => (
                <View
                  key={entry.id}
                  style={twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4")}
                >
                  <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-blue-100")}>
                    <Ionicons name="person" size={20} color="#1d4ed8" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{entry.client_name}</Text>
                    {entry.service_name ? (
                      <Text style={twStyle("text-xs text-gray-500")}>{entry.service_name}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
