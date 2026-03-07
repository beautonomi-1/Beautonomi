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

type WaitlistEntry = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  notes: string | null;
  status: string;
  priority: number | null;
  created_at: string;
  service?: { id: string; title: string } | null;
  staff?: { id: string; name: string } | null;
};

type WaitlistResponse = { entries: WaitlistEntry[]; total?: number };

function statusBgColor(status: string): string {
  switch (status) {
    case "waiting":
      return "#fef3c7";
    case "contacted":
      return "#dbeafe";
    case "booked":
      return "#dcfce7";
    default:
      return Colors.gray[100];
  }
}

export default function WaitlistScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<WaitlistResponse>("/api/provider/waitlist");

  const entries: WaitlistEntry[] = data?.entries ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Waitlist" subtitle="Appointments, waitlist & schedule" onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="people-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No waitlist entries</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Entries will appear here when customers join the waitlist
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {entries.map((entry) => (
              <View
                key={entry.id}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                    {entry.customer_name || "No name"}
                  </Text>
                  <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBgColor(entry.status) }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[800] }}>{entry.status}</Text>
                  </View>
                </View>
                {entry.service && (
                  <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{entry.service.title}</Text>
                )}
                {(entry.preferred_date || entry.customer_phone) && (
                  <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
                    {entry.preferred_date
                      ? new Date(entry.preferred_date).toLocaleDateString()
                      : ""}
                    {entry.preferred_date && entry.customer_phone ? " · " : ""}
                    {entry.customer_phone ?? ""}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
