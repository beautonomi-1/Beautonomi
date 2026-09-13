import { useCallback, useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
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
import { SUPPORT_TICKETS_API_PREFIX } from "@/lib/support-ticket-api";

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
  last_message_from?: string | null;
  has_unread_staff_reply?: boolean;
  created_at: string;
  updated_at: string;
};

const SUPPORT_CONTEXT_KEYS: Record<string, string> = {
  booking: "contextBooking",
  product_order: "contextProductOrder",
  gift_card: "contextGiftCard",
  payment: "contextPayment",
  provider_onboarding: "contextOnboarding",
  account: "contextAccount",
  technical: "contextTechnical",
  other: "contextOther",
};

const STATUS_KEYS: Record<string, string> = {
  open: "statusOpen",
  in_progress: "statusInProgress",
  resolved: "statusResolved",
  closed: "statusClosed",
};

type TicketsResponse = { tickets?: Ticket[]; total?: number };

function formatDateSafe(value: unknown, empty: string): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return empty;
  return parsed.toLocaleDateString();
}

function categoryLabel(value: string | null | undefined): string {
  if (!value) return "";
  return labelForSupportTicketCategory(value);
}

function contextLabel(ticket: Ticket, st: (key: string) => string): string | null {
  if (!ticket.support_context_type) return ticket.support_context_label || null;
  const key = SUPPORT_CONTEXT_KEYS[ticket.support_context_type];
  const base = key ? st(key) : ticket.support_context_type.replace(/_/g, " ");
  return ticket.support_context_label ? `${base}: ${ticket.support_context_label}` : base;
}

function statusLabel(status: string, st: (key: string) => string): string {
  const key = STATUS_KEYS[status];
  return key ? st(key) : status.replace(/_/g, " ");
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
  const { t } = useTranslation();
  const st = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.supportTicketsList.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<TicketsResponse>(SUPPORT_TICKETS_API_PREFIX);
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
        <ScreenHeader title={st("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={st("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={st("title")}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/support-tickets/new" as never)}
            hitSlop={8}
            accessibilityLabel={st("newTicketA11y")}
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
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>{st("empty")}</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              {st("emptyHint")}
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/support-tickets/new" as never)}
              style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: Colors.primary }}
              accessibilityLabel={st("newTicketA11y")}
              accessibilityRole="button"
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{st("newTicket")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {tickets.map((ticket) => (
              <TouchableOpacity
                key={ticket.id}
                onPress={() => router.push(`/(app)/(tabs)/more/support-tickets/${ticket.id}` as never)}
                activeOpacity={0.7}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                accessibilityLabel={st("ticketA11y", { number: ticket.ticket_number, subject: ticket.subject, status: statusLabel(ticket.status, st) })}
                accessibilityRole="button"
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 12, color: Colors.gray[500] }}>{ticket.ticket_number}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {ticket.has_unread_staff_reply || ticket.last_message_from === "staff" ? (
                      <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#dbeafe" }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: "#1d4ed8" }}>{st("newReply")}</Text>
                      </View>
                    ) : null}
                    <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBgColor(ticket.status) }}>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[800] }}>
                        {statusLabel(ticket.status, st)}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={2}>
                  {ticket.subject}
                </Text>
                {contextLabel(ticket, st) ? (
                  <Text style={{ marginTop: 6, fontSize: 12, color: Colors.gray[700] }} numberOfLines={1}>
                    {st("about", { context: contextLabel(ticket, st) })}
                  </Text>
                ) : null}
                <Text style={{ marginTop: 6, fontSize: 12, color: Colors.gray[500] }}>
                  {ticket.category
                    ? st("metaWithCategory", { category: categoryLabel(ticket.category), priority: ticket.priority, date: formatDateSafe(ticket.updated_at, st("emptyDate")) })
                    : st("meta", { priority: ticket.priority, date: formatDateSafe(ticket.updated_at, st("emptyDate")) })}
                </Text>
                {shouldAskForCsat(ticket) ? (
                  <Text style={{ marginTop: 8, fontSize: 12, fontWeight: "700", color: Colors.primary }}>
                    {st("rateExperience")}
                  </Text>
                ) : typeof ticket.csat_score === "number" ? (
                  <Text style={{ marginTop: 8, fontSize: 12, color: Colors.gray[600] }}>
                    {st("yourRating", { score: ticket.csat_score })}
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
