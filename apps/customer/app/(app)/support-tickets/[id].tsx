import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { trackSupportTicketDetailView, trackSupportTicketReply } from "@/lib/analytics";
import { labelForSupportTicketCategory } from "@/lib/supportTicketCategoryPresets";
import { useScreenTracking } from "@/hooks/useScreenTracking";

type Message = {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  user_id: string;
  author_name?: string | null;
  is_mine?: boolean;
};

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

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

function statusBg(status: string): string {
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

export default function SupportTicketDetailScreen() {
  useScreenTracking("Support ticket detail");
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const res = await api.get<{ ticket: Ticket; messages: Message[] }>(`/api/me/support-tickets/${id}`);
      if (res.error) {
        setTicket(null);
        setMessages([]);
        setLoadError(getApiErrorMessage(res.error, "Could not load ticket"));
        return;
      }
      const payload = res.data;
      const t = payload?.ticket ?? null;
      setTicket(t);
      setMessages(Array.isArray(payload?.messages) ? payload!.messages! : []);
      if (t) trackSupportTicketDetailView(t.id, t.ticket_number);
    } catch (e) {
      setTicket(null);
      setMessages([]);
      setLoadError(e instanceof Error ? e.message : "Could not load ticket");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  useLayoutEffect(() => {
    if (ticket?.ticket_number) {
      navigation.setOptions({ title: ticket.ticket_number });
    }
  }, [navigation, ticket?.ticket_number]);

  useEffect(() => {
    if (messages.length > 0) {
      const t = setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
      return () => clearTimeout(t);
    }
  }, [messages.length]);

  const handleReply = async () => {
    const msg = reply.trim();
    if (!msg || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);
    try {
      const res = await api.post(`/api/me/support-tickets/${id}/messages`, { message: msg });
      if (res.error) {
        Alert.alert("Could not send", getApiErrorMessage(res.error, "Could not send reply"));
        return;
      }
      setReply("");
      trackSupportTicketReply(id);
      await loadTicket();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  if (!id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Invalid ticket</Text>
      </View>
    );
  }

  if (loading && !ticket) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.errorColumn}>
        {loadError ? (
          <>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={loadTicket} style={styles.retryWrap} accessibilityRole="button">
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.muted}>Ticket not found</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.retryWrap} accessibilityRole="button">
              <Text style={styles.retryText}>Back to list</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  const canReply = ticket.status !== "closed" && ticket.status !== "resolved";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.headerRow}>
            <View style={[styles.statusPill, { backgroundColor: statusBg(ticket.status) }]}>
              <Text style={styles.statusPillText}>{ticket.status.replace("_", " ")}</Text>
            </View>
            <Text style={styles.dateSmall}>{formatDateSafe(ticket.created_at)}</Text>
          </View>
          <Text style={styles.title}>{ticket.subject}</Text>
          <Text style={styles.subMeta}>
            {ticket.category ? `Category: ${labelForSupportTicketCategory(String(ticket.category))} · ` : ""}
            Priority: {ticket.priority}
          </Text>

          {messages.map((m) => {
            const isOwn = m.is_mine ?? m.user_id === user?.id;
            const authorLabel = isOwn ? "You" : m.author_name ?? "Support Team";
            const initials =
              authorLabel === "You"
                ? "Me"
                : authorLabel
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
            return (
              <View key={m.id} style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther]}>
                {!isOwn && (
                  <View style={styles.msgAuthorRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <Text style={[styles.authorName, styles.authorNameSpacing]}>{authorLabel}</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    isOwn ? styles.bubbleOwn : styles.bubbleOther,
                    isOwn ? styles.bubbleRadiusOwn : styles.bubbleRadiusOther,
                  ]}
                >
                  <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{m.message}</Text>
                  <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
                    {formatDateTimeSafe(m.created_at)}
                  </Text>
                </View>
              </View>
            );
          })}

          {canReply && (
            <View style={styles.replyBlock}>
              <Text style={styles.label}>Add a reply</Text>
              <TextInput
                style={styles.replyInput}
                placeholder="Type your message..."
                placeholderTextColor="#9ca3af"
                value={reply}
                onChangeText={setReply}
                multiline
                editable={!sending}
              />
              <TouchableOpacity
                onPress={handleReply}
                disabled={sending || !reply.trim()}
                style={[styles.sendBtn, (sending || !reply.trim()) && styles.sendBtnDisabled]}
                accessibilityRole="button"
              >
                <Text style={styles.sendBtnText}>{sending ? "Sending…" : "Send reply"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!canReply && (
            <Text style={styles.closedNote}>
              This ticket is {ticket.status}. Open Help → Contact support to start a new ticket if you need further
              help.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 220 },
  inner: { paddingHorizontal: 12, paddingTop: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  errorColumn: { flex: 1, justifyContent: "center", paddingHorizontal: 16, backgroundColor: "#fff" },
  errorText: { color: Colors.gray[600], textAlign: "center" },
  muted: { color: Colors.gray[500], textAlign: "center" },
  retryWrap: { marginTop: 16, alignSelf: "center" },
  retryText: { color: Colors.primary, fontWeight: "600" },
  headerRow: { marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusPill: { borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: "600", color: Colors.gray[800] },
  dateSmall: { fontSize: 12, color: Colors.gray[500] },
  title: { fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 },
  subMeta: { marginBottom: 16, fontSize: 12, color: Colors.gray[500] },
  msgRow: { marginBottom: 10 },
  msgRowOwn: { alignItems: "flex-end" },
  msgRowOther: { alignItems: "flex-start" },
  msgAuthorRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  authorNameSpacing: { marginLeft: 4 },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  authorName: { fontSize: 11, color: Colors.gray[500], fontWeight: "600" },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: Colors.primary },
  bubbleOther: { backgroundColor: "#F3F4F6" },
  bubbleRadiusOwn: { borderRadius: 16, borderBottomRightRadius: 4 },
  bubbleRadiusOther: { borderRadius: 16, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: "#111827", lineHeight: 20 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTime: { marginTop: 4, fontSize: 10, color: "#9CA3AF" },
  bubbleTimeOwn: { color: "rgba(255,255,255,0.65)", textAlign: "right" },
  replyBlock: { marginTop: 16 },
  label: { marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] },
  replyInput: {
    marginBottom: 12,
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.gray[900],
  },
  sendBtn: {
    borderRadius: 12,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontWeight: "600", color: "#fff", fontSize: 16 },
  closedNote: { marginTop: 16, fontSize: 14, color: Colors.gray[500] },
});
