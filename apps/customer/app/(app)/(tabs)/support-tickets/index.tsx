import { useCallback, useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter, useNavigation, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { pushCustomerLogin } from "@/lib/guest-browse-policy";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
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
  support_context_type?: string | null;
  support_context_label?: string | null;
  csat_score?: number | null;
  has_unread_staff_reply?: boolean;
  last_message_from?: "customer" | "staff" | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
};

const CONTEXT_TYPE_KEYS: Record<string, string> = {
  booking: "contextBooking",
  product_order: "contextProductOrder",
  gift_card: "contextGiftCard",
  payment: "contextPayment",
  provider_onboarding: "contextProviderOnboarding",
  account: "contextAccount",
  technical: "contextTechnical",
  other: "contextOther",
};

const STATUS_KEYS: Record<string, string> = {
  open: "statusOpen",
  in_progress: "statusInProgress",
  waiting_customer: "statusWaitingCustomer",
  resolved: "statusResolved",
  closed: "statusClosed",
};

const PRIORITY_KEYS: Record<string, string> = {
  low: "priorityLow",
  medium: "priorityMedium",
  high: "priorityHigh",
  urgent: "priorityUrgent",
};

const PAGE_SIZE = 50;

type TicketsResponse = {
  tickets?: Ticket[];
  total?: number;
  pagination?: { has_more?: boolean };
};

type TranslateFn = (key: string, opts?: Record<string, string | number>) => string;

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

function contextLabel(ticket: Ticket, st: TranslateFn): string | null {
  if (!ticket.support_context_type) return ticket.support_context_label || null;
  const key = CONTEXT_TYPE_KEYS[ticket.support_context_type];
  const base = key ? st(key) : ticket.support_context_type.replace(/_/g, " ");
  return ticket.support_context_label ? `${base}: ${ticket.support_context_label}` : base;
}

function statusLabel(status: string, st: TranslateFn): string {
  const key = STATUS_KEYS[status];
  return key ? st(key) : status.replace(/_/g, " ");
}

function priorityLabel(priority: string, st: TranslateFn): string {
  const key = PRIORITY_KEYS[priority];
  return key ? st(key) : priority;
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
    case "waiting_customer":
      return "#fce7f3";
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
  const { t } = useTranslation();
  const st = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`customer.mobile.screens.supportTickets.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const navigation = useNavigation();
  const { user, loading: authLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [extraTickets, setExtraTickets] = useState<Ticket[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const { data, loading, error, refresh } = useApi<TicketsResponse>(`/api/me/support-tickets?limit=${PAGE_SIZE}&offset=0`);
  const skipNextListFocusRefresh = useRef(true);

  /** CSAT is written on the detail screen; list data is cached by useApi — refetch when returning to this screen (skip first focus; useApi already loads on mount). */
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
    setExtraTickets([]);
    setLoadMoreError(null);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const firstPageTickets: Ticket[] =
    data && typeof data === "object" && Array.isArray((data as TicketsResponse).tickets)
      ? (data as TicketsResponse).tickets ?? []
      : [];
  const tickets = [...firstPageTickets, ...extraTickets];
  const total = data && typeof data === "object" ? (data as TicketsResponse).total : undefined;
  const canLoadMore =
    typeof total === "number"
      ? tickets.length < total
      : Boolean(data && typeof data === "object" && (data as TicketsResponse).pagination?.has_more);

  const loadMore = useCallback(async () => {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await api.get<TicketsResponse>(
        `/api/me/support-tickets?limit=${PAGE_SIZE}&offset=${tickets.length}`,
      );
      if (res.error) {
        setLoadMoreError(res.error.message || st("loadMoreFailed"));
        return;
      }
      const next = Array.isArray(res.data?.tickets) ? res.data.tickets : [];
      setExtraTickets((current) => [...current, ...next]);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : st("loadMoreFailed"));
    } finally {
      setLoadingMore(false);
    }
  }, [canLoadMore, loadingMore, st, tickets.length]);

  useEffect(() => {
    if (!loading && data !== undefined && data !== null) {
      trackSupportTicketsView();
    }
  }, [loading, data]);

  useLayoutEffect(() => {
    if (!user) {
      navigation.setOptions({ headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/support-tickets/new" as never)}
          hitSlop={12}
          accessibilityLabel={st("newTicketA11y")}
          accessibilityRole="button"
          style={{ marginEnd: 8, height: 40, width: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add-circle-outline" size={26} color={Colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, st, user]);

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.centered, { padding: 32 }]}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 8, textAlign: "center" }}>
          {st("title")}
        </Text>
        <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
          {st("loginPrompt")}
        </Text>
        <TouchableOpacity
          onPress={() => pushCustomerLogin("/(app)/(tabs)/support-tickets")}
          style={{ backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
          accessibilityRole="button"
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("auth.login")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
          <Text style={styles.retryText}>{st("retry")}</Text>
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
          <Text style={styles.emptyTitle}>{st("emptyTitle")}</Text>
          <Text style={styles.emptySubtitle}>{st("emptySubtitle")}</Text>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/support-tickets/new" as never)}
            style={styles.emptyCta}
            accessibilityLabel={st("newTicketA11y")}
            accessibilityRole="button"
          >
            <Text style={styles.emptyCtaText}>{st("newTicket")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.list}>
          {tickets.map((ticket) => {
            const ticketStatus = statusLabel(ticket.status, st);
            const about = contextLabel(ticket, st);
            return (
              <TouchableOpacity
                key={ticket.id}
                onPress={() => router.push(`/(app)/(tabs)/support-tickets/${ticket.id}` as never)}
                activeOpacity={0.7}
                style={styles.card}
                accessibilityLabel={st("ticketA11y", {
                  number: ticket.ticket_number,
                  subject: ticket.subject,
                  status: ticketStatus,
                })}
                accessibilityRole="button"
              >
                <View style={styles.cardTop}>
                  <Text style={styles.ticketNum}>{ticket.ticket_number}</Text>
                  <View style={styles.pillRow}>
                    {ticket.has_unread_staff_reply || ticket.last_message_from === "staff" ? (
                      <View style={styles.replyPill}>
                        <Text style={styles.replyPillText}>{st("newReply")}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.statusPill, { backgroundColor: statusBgColor(ticket.status) }]}>
                      <Text style={styles.statusText}>{ticketStatus}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.subject} numberOfLines={2}>
                  {ticket.subject}
                </Text>
                {about ? (
                  <Text style={styles.contextMeta} numberOfLines={1}>
                    {st("aboutContext", { context: about })}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {ticket.category ? `${categoryLabel(ticket.category)} · ` : ""}
                  {st("priorityLabel", { priority: priorityLabel(ticket.priority, st) })}
                  {" · "}
                  {st("updatedLabel", { date: formatDateSafe(ticket.updated_at) })}
                </Text>
                {shouldAskForCsat(ticket) ? (
                  <Text style={styles.csatPrompt}>{st("rateExperience")}</Text>
                ) : typeof ticket.csat_score === "number" ? (
                  <Text style={styles.csatScore}>{st("yourRating", { score: ticket.csat_score })}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {loadMoreError ? <Text style={styles.loadMoreError}>{loadMoreError}</Text> : null}
          {canLoadMore ? (
            <TouchableOpacity
              onPress={loadMore}
              disabled={loadingMore}
              style={[styles.loadMoreBtn, loadingMore && styles.loadMoreBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={st("loadMoreA11y")}
            >
              {loadingMore ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>{st("loadMore")}</Text>
              )}
            </TouchableOpacity>
          ) : null}
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
  pillRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  replyPill: { borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#dbeafe" },
  replyPillText: { fontSize: 12, fontWeight: "700", color: "#1d4ed8" },
  statusPill: { borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 12, fontWeight: "500", color: Colors.gray[800] },
  subject: { fontWeight: "600", color: Colors.gray[900] },
  contextMeta: { marginTop: 6, fontSize: 12, color: Colors.gray[700] },
  meta: { marginTop: 6, fontSize: 12, color: Colors.gray[500] },
  csatPrompt: { marginTop: 8, fontSize: 12, fontWeight: "700", color: Colors.primary },
  csatScore: { marginTop: 8, fontSize: 12, color: Colors.gray[600] },
  loadMoreBtn: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingVertical: 12,
    alignItems: "center",
  },
  loadMoreBtnDisabled: { opacity: 0.6 },
  loadMoreText: { color: Colors.primary, fontWeight: "600" },
  loadMoreError: { color: "#b91c1c", textAlign: "center", marginBottom: 8 },
});
