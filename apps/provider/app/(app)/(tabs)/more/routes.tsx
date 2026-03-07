import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

function todayISO(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

type Segment = {
  id: string;
  segment_order?: number;
  to_booking?: {
    ref_number?: string;
    scheduled_at?: string;
    customer?: { full_name?: string } | null;
  } | null;
};

type RoutesResponse = {
  route?: { id: string } | null;
  segments?: Segment[];
};

export default function RoutesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const date = todayISO();
  const { data, loading, error, refresh } = useApi<RoutesResponse>(
    `/api/provider/routes?date=${date}`
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Routes" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Routes" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const res = data as RoutesResponse;
  const segments = res?.segments ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Routes"
        subtitle="Optimize at-home trips"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 12 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
            Route for {new Date(date).toLocaleDateString()}
          </Text>
        </View>
        {segments.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="navigate-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No route for today</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Plan and optimize routes in the web portal
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {segments.map((seg, i) => (
              <View
                key={seg.id}
                style={{ marginBottom: 12, flexDirection: "row", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ marginRight: 12, height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#e0e7ff" }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#3730a3" }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                    {seg.to_booking?.customer?.full_name ?? "Stop"}
                  </Text>
                  {seg.to_booking?.ref_number && (
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{seg.to_booking.ref_number}</Text>
                  )}
                  {seg.to_booking?.scheduled_at && (
                    <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[600] }}>
                      {new Date(seg.to_booking.scheduled_at).toLocaleTimeString()}
                    </Text>
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
