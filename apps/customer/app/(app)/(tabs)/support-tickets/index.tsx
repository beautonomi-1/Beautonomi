import { useCallback, useState, useEffect, useLayoutEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { Colors } from "@/constants/colors";
import { labelForSupportTicketCategory } from "@/lib/supportTicketCategoryPresets";
import { useScreenTracking } from "@/hooks/useScreenTracking";
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

function categoryLabel(value: string | null | undefined): string {
  if (!value) return "";
  return labelForSupportTicketCategory(value);
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
  useScreenTracking("Support tickets");
  const router = useRouter();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<TicketsResponse>("/api/me/support-tickets");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const tickets: Ticket[] =
    data && typeof data === "object" && Array.isArray((data as TicketsResponse).tickets)
      ? (data as TicketsResponse).tickets ?? []
      : [];

  useEffect(() => {
    if (!loading && data !== undefined && data !== null) {
      trackSupportTicketsView();
    }
  }, [loading, data]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(app)/help" as never);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={{ marginLeft: Platform.OS === "ios" ? 8 : 4, padding: 4 }}
        >
          <Ionicons name="chevron-back" size={26} color={Colors.primary} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/support-tickets/new" as never)}
          hitSlop={12}
          accessibilityLabel="New support ticket"
          accessibilityRole="button"
          style={{ marginRight: 8, height: 40, width: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add-circle-outline" size={26} color={Colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => refresh()} style={styles.retryBtn} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {tickets.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyTitle}>No support tickets yet</Text>
          <Text style={styles.emptySubtitle}>Submit a ticket from Help → Contact support, or tap below.</Text>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/support-tickets/new" as never)}
            style={styles.emptyCta}
            accessibilityLabel="New support ticket"
            accessibilityRole="button"
          >
            <Text style={styles.emptyCtaText}>New support ticket</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.list}>
          {tickets.map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => router.push(`/(app)/(tabs)/support-tickets/${t.id}` as never)}
              activeOpacity={0.7}
              style={styles.card}
              accessibilityLabel={`Support ticket ${t.ticket_number}, ${t.subject}, ${t.status.replace("_", " ")}`}
              accessibilityRole="button"
            >
              <View style={styles.cardTop}>
                <Text style={styles.ticketNum}>{t.ticket_number}</Text>
                <View style={[styles.statusPill, { backgroundColor: statusBgColor(t.status) }]}>
                  <Text style={styles.statusText}>{t.status.replace("_", " ")}</Text>
                </View>
              </View>
              <Text style={styles.subject} numberOfLines={2}>
                {t.subject}
              </Text>
              <Text style={styles.meta}>
                {t.category ? `${categoryLabel(t.category)} · ` : ""}
                Priority: {t.priority}
                {" · "}Updated {formatDateSafe(t.updated_at)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { paddingBottom: 100, paddingHorizontal: 8, paddingTop: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48, backgroundColor: "#fff" },
  errorWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: "#fff" },
  errorText: { color: Colors.gray[600], textAlign: "center" },
  retryBtn: { marginTop: 16, alignSelf: "center" },
  retryText: { color: Colors.primary, fontWeight: "600", fontSize: 16 },
  empty: { paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" },
  emptyTitle: { marginTop: 16, textAlign: "center", color: Colors.gray[600] },
  emptySubtitle: { marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] },
  emptyCta: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: Colors.primary },
  emptyCtaText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  list: { paddingBottom: 16 },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    padding: 16,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  ticketNum: { fontFamily: "monospace", fontSize: 12, color: Colors.gray[500] },
  statusPill: { borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 12, fontWeight: "500", color: Colors.gray[800] },
  subject: { fontWeight: "600", color: Colors.gray[900] },
  meta: { marginTop: 6, fontSize: 12, color: Colors.gray[500] },
});
