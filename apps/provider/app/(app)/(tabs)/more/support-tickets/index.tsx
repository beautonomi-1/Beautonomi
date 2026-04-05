import { useCallback, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { trackSupportTicketsView } from "@/lib/analytics";

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

type TicketsResponse = { tickets?: Ticket[]; total?: number };

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function statusBgColor(status: string): string {
  switch (status) {
    case "open":
      return "#dbeafe";
    case "in_progress":
      return "#fef3c2";
    case "resolved":
      return "#dcfce7";
    case "closed":
      return Colors.gray[100];
    default:
      return Colors.gray[100];
  }
}

export default function SupportTicketsListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<TicketsResponse>("/api/me/support-tickets");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const tickets: Ticket[] = data?.tickets ?? [];

  useEffect(() => {
    if (!loading && data !== undefined) {
      trackSupportTicketsView();
    }
  }, [loading, data]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="My support tickets" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="My support tickets" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Support tickets"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/support-tickets/new" as never)}
            hitSlop={8}
            accessibilityLabel="New support ticket"
            accessibilityRole="button"
            style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="add-circle-outline" size={26} color={Colors.primary} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {tickets.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No support tickets yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Tap the + button to submit a new support ticket
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/support-tickets/new" as never)}
              style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: Colors.primary }}
              accessibilityLabel="New support ticket"
              accessibilityRole="button"
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>New support ticket</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 8, paddingBottom: 16 }}>
            {tickets.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => router.push(`/(app)/(tabs)/more/support-tickets/${t.id}` as never)}
                activeOpacity={0.7}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                accessibilityLabel={`Support ticket ${t.ticket_number}, ${t.subject}, ${t.status.replace("_", " ")}`}
                accessibilityRole="button"
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 12, color: Colors.gray[500] }}>{t.ticket_number}</Text>
                  <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBgColor(t.status) }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[800] }}>
                      {t.status.replace("_", " ")}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={2}>
                  {t.subject}
                </Text>
                <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
                  Updated {formatDateSafe(t.updated_at)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
