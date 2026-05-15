import { useCallback, useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { trackSupportTicketsView } from "@/lib/analytics";
import { labelForSupportTicketCategory } from "@/lib/supportTicketCategoryPresets";

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  support_context_type?: string | null;
  support_context_label?: string | null;
  csat_score?: number | null;
  created_at: string;
  updated_at: string;
};

const SUPPORT_CONTEXT_LABELS: Record<string, string> = {
  booking: "Booking",
  product_order: "Product order",
  gift_card: "Gift card",
  payment: "Payment",
  provider_onboarding: "Provider onboarding",
  account: "Account",
  technical: "Technical",
  other: "Other",
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

function contextLabel(ticket: Ticket): string | null {
  if (!ticket.support_context_type) return ticket.support_context_label || null;
  const base = SUPPORT_CONTEXT_LABELS[ticket.support_context_type] ?? ticket.support_context_type.replace(/_/g, " ");
  return ticket.support_context_label ? `${base}: ${ticket.support_context_label}` : base;
}

function shouldAskForCsat(ticket: Ticket): boolean {
  return (
    (ticket.status === "resolved" || ticket.status === "closed") &&
    typeof ticket.csat_score !== "number"
  );
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
  const skipNextListFocusRefresh = useRef(true);

  /** CSAT is submitted on the ticket detail screen; useApi caches this list — refetch when returning (skip first focus; useApi loads on mount). */
  useFocusEffect(
    useCallback(() => {
      if (skipNextListFocusRefresh.current) {
        skipNextListFocusRefresh.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
  );

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
                {contextLabel(t) ? (
                  <Text style={{ marginTop: 6, fontSize: 12, color: Colors.gray[700] }} numberOfLines={1}>
                    About {contextLabel(t)}
                  </Text>
                ) : null}
                <Text style={{ marginTop: 6, fontSize: 12, color: Colors.gray[500] }}>
                  {t.category ? `${categoryLabel(t.category)} · ` : ""}
                  Priority: {t.priority}
                  {" · "}Updated {formatDateSafe(t.updated_at)}
                </Text>
                {shouldAskForCsat(t) ? (
                  <Text style={{ marginTop: 8, fontSize: 12, fontWeight: "700", color: Colors.primary }}>
                    Rate this support experience
                  </Text>
                ) : typeof t.csat_score === "number" ? (
                  <Text style={{ marginTop: 8, fontSize: 12, color: Colors.gray[600] }}>
                    Your rating: {t.csat_score}/5
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
