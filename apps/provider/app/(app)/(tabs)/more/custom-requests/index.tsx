import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

type CustomRequest = {
  id: string;
  description?: string | null;
  status?: string | null;
  created_at: string;
  location_type?: string | null;
  duration_minutes?: number | null;
  preferred_start_at?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  customer?: { full_name?: string | null; email?: string | null } | null;
  offers?: { status?: string; price?: number; created_at?: string }[];
};

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

export default function CustomRequestsListScreen() {
  const router = useRouter();
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const customRequestsUrl = selectedLocationId
    ? `/api/provider/custom-requests?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/custom-requests";
  const { data, loading, error, refresh } = useApi<CustomRequest[] | { data?: CustomRequest[] }>(
    customRequestsUrl
  );

  const requests: CustomRequest[] = Array.isArray(data) ? data : (data as { data?: CustomRequest[] })?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Custom requests" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Custom requests" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Custom requests"
        subtitle="Client quotes & offers"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {requests.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="chatbox-ellipses-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No custom requests yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Client requests will appear here
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {requests.map((r) => (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.7}
                onPress={() => router.push(`/(app)/(tabs)/more/custom-requests/${r.id}`)}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                    {r.customer?.full_name ?? r.customer?.email ?? "Customer"}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </View>
                {r.description ? (
                  <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[600] }} numberOfLines={2}>
                    {r.description}
                  </Text>
                ) : null}
                <Text style={{ marginTop: 8, fontSize: 12, color: Colors.gray[500] }}>
                  {formatDateSafe(r.created_at)}
                  {r.location_type === "at_home" ? " · At home" : " · At salon"}
                  {r.offers?.length ? ` · ${r.offers.length} offer(s)` : " · No offer yet"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
