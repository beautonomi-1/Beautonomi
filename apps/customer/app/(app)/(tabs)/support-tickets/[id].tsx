import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
  Linking,
  AppState,
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
import { useTranslation } from "@beautonomi/i18n";
import { useImagePicker } from "@/hooks/useImagePicker";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { invalidateSupportTicketsListCache } from "@/lib/api-response-cache";

type Message = {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  user_id: string;
  author_name?: string | null;
  is_mine?: boolean;
  attachments?: SupportAttachment[];
};

type SupportAttachment = {
  url: string;
  name: string;
  type: string;
  size?: number;
};

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
  csat_comment?: string | null;
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

export default function SupportTicketDetailScreen() {
  useScreenTracking("Support ticket detail");
  const { t } = useTranslation();
  const sd = useCallback(
    (key: string) => t(`customer.mobile.screens.supportTicketDetail.${key}`) as string,
    [t],
  );
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
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<SupportAttachment[]>([]);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [csatComment, setCsatComment] = useState("");
  const [submittingCsat, setSubmittingCsat] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const loadedOnceRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { pickFromLibrary } = useImagePicker();

  const loadTicket = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const res = await api.get<{ ticket: Ticket; messages: Message[] }>(`/api/me/support-tickets/${id}`);
      if (res.error) {
        setTicket(null);
        setMessages([]);
        setLoadError(getApiErrorMessage(res.error, sd("loadFailedFallback")));
        return;
      }
      const payload = res.data;
      const loadedTicket = payload?.ticket ?? null;
      const loadedMessages = Array.isArray(payload?.messages) ? payload!.messages! : [];
      const newStaffMessage = loadedMessages.some((m) => {
        const isMine = m.is_mine ?? m.user_id === user?.id;
        return !isMine && !knownMessageIdsRef.current.has(m.id);
      });
      setTicket(loadedTicket);
      setCsatScore(loadedTicket?.csat_score ?? null);
      setCsatComment(loadedTicket?.csat_comment ?? "");
      setMessages(loadedMessages);
      if (loadedOnceRef.current && newStaffMessage) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
      }
      knownMessageIdsRef.current = new Set(loadedMessages.map((m) => m.id));
      loadedOnceRef.current = true;
      void api.post(`/api/me/support-tickets/${id}/seen`, {}).catch(() => {});
      if (loadedTicket) trackSupportTicketDetailView(loadedTicket.id, loadedTicket.ticket_number);
    } catch (e) {
      setTicket(null);
      setMessages([]);
      setLoadError(e instanceof Error ? e.message : sd("loadFailedFallback"));
    } finally {
      setLoading(false);
    }
  }, [id, sd, user?.id]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    let active = AppState.currentState === "active";
    const sub = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (active) void loadTicket();
    });
    const timer = setInterval(() => {
      if (active) void loadTicket();
    }, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [loadTicket]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadTicket();
    } finally {
      setRefreshing(false);
    }
  }, [loadTicket]);

  useEffect(() => {
    const tid = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";
    if (!tid) return;
    void api.post("/api/me/notifications/mark-related-read", { ticket_id: tid }).catch(() => {});
  }, [id]);

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
    if ((!msg && pendingAttachments.length === 0) || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);
    try {
      const res = await api.post(`/api/me/support-tickets/${id}/messages`, {
        message: msg,
        attachments: pendingAttachments,
      });
      if (res.error) {
        Alert.alert(sd("sendFailedTitle"), getApiErrorMessage(res.error, sd("sendReplyFallback")));
        return;
      }
      setReply("");
      setPendingAttachments([]);
      trackSupportTicketReply(id);
      await loadTicket();
    } catch (e) {
      Alert.alert(
        t("customer.mobile.screens.authLogin.errorTitle"),
        e instanceof Error ? e.message : sd("sendReplyFallback"),
      );
    } finally {
      setSending(false);
    }
  };

  const attachImage = async () => {
    if (!id || uploadingAttachment || pendingAttachments.length >= 6) return;
    setUploadingAttachment(true);
    try {
      const picked = await pickFromLibrary();
      if (!picked) return;
      const formData = new FormData();
      appendFormDataFileNative(formData, "files", {
        uri: picked.uri,
        name: picked.fileName || "support-image.jpg",
        type: picked.mimeType || "image/jpeg",
      });
      const res = await api.fetch<{ attachments?: SupportAttachment[] }>(
        `/api/me/support-tickets/${id}/upload`,
        { method: "POST", body: formData },
      );
      if (res.error) {
        Alert.alert(sd("uploadFailedTitle"), getApiErrorMessage(res.error, sd("uploadAttachmentFallback")));
        return;
      }
      const attachments = res.data?.attachments ?? [];
      if (attachments.length === 0) {
        Alert.alert(sd("uploadFailedTitle"), sd("uploadNoAttachmentReturned"));
        return;
      }
      setPendingAttachments((prev) => [...prev, ...attachments].slice(0, 6));
    } catch (e) {
      Alert.alert(
        sd("uploadFailedTitle"),
        e instanceof Error ? e.message : sd("uploadAttachmentFallback"),
      );
    } finally {
      setUploadingAttachment(false);
    }
  };

  const openAttachment = (attachment: SupportAttachment) => {
    Linking.openURL(attachment.url).catch(() => {
      Alert.alert(sd("openFailedTitle"), sd("openFailedBody"));
    });
  };

  const submitCsat = async () => {
    if (!id || !csatScore) return;
    setSubmittingCsat(true);
    try {
      const res = await api.post(`/api/me/support-tickets/${id}/csat`, {
        score: csatScore,
        comment: csatComment.trim() || null,
      });
      if (res.error) {
        Alert.alert("Could not submit rating", getApiErrorMessage(res.error, "Please try again."));
        return;
      }
      Alert.alert("Thanks", "Your rating helps us improve support.");
      await loadTicket();
    } catch (e) {
      Alert.alert("Could not submit rating", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSubmittingCsat(false);
    }
  };

  if (!id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{sd("invalidTicket")}</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
          {ticket.support_context_type ? (
            <Text style={styles.contextMeta}>
              About: {ticket.support_context_type.replace(/_/g, " ")}
              {ticket.support_context_label ? ` · ${ticket.support_context_label}` : ""}
            </Text>
          ) : null}

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
                  {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                    <View style={styles.attachmentList}>
                      {m.attachments.map((attachment, index) => (
                        <TouchableOpacity
                          key={`${m.id}-att-${index}`}
                          onPress={() => openAttachment(attachment)}
                          style={[styles.attachmentPill, isOwn && styles.attachmentPillOwn]}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.attachmentText, isOwn && styles.attachmentTextOwn]} numberOfLines={1}>
                            📎 {attachment.name || `Attachment ${index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
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
              {pendingAttachments.length > 0 && (
                <View style={styles.pendingAttachments}>
                  {pendingAttachments.map((attachment, index) => (
                    <View key={`${attachment.url}-${index}`} style={styles.pendingAttachment}>
                      <Text style={styles.pendingAttachmentText} numberOfLines={1}>
                        {attachment.name || `Attachment ${index + 1}`}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== index))}
                        accessibilityRole="button"
                      >
                        <Text style={styles.pendingRemove}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity
                onPress={attachImage}
                disabled={sending || uploadingAttachment || pendingAttachments.length >= 6}
                style={styles.attachBtn}
                accessibilityRole="button"
              >
                {uploadingAttachment ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.attachBtnText}>Attach image</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReply}
                disabled={sending || (!reply.trim() && pendingAttachments.length === 0)}
                style={[
                  styles.sendBtn,
                  (sending || (!reply.trim() && pendingAttachments.length === 0)) && styles.sendBtnDisabled,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.sendBtnText}>{sending ? "Sending…" : "Send reply"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!canReply && (
            <View style={styles.csatBlock}>
              <Text style={styles.label}>
                {typeof ticket.csat_score === "number" ? "Your support rating" : "Rate this support experience"}
              </Text>
              <View style={styles.csatRow}>
                {[1, 2, 3, 4, 5].map((score) => (
                  <TouchableOpacity
                    key={score}
                    onPress={() => setCsatScore(score)}
                    style={[styles.csatChip, csatScore === score && styles.csatChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: csatScore === score }}
                  >
                    <Text style={[styles.csatText, csatScore === score && styles.csatTextActive]}>{score}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.csatInput}
                placeholder="Optional comment"
                placeholderTextColor="#9ca3af"
                value={csatComment}
                onChangeText={setCsatComment}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                onPress={submitCsat}
                disabled={!csatScore || submittingCsat}
                style={[styles.sendBtn, (!csatScore || submittingCsat) && styles.sendBtnDisabled]}
                accessibilityRole="button"
              >
                <Text style={styles.sendBtnText}>
                  {submittingCsat ? "Submitting…" : typeof ticket.csat_score === "number" ? "Update rating" : "Submit rating"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.closedNote}>
                This ticket is {ticket.status}. Open Help → New ticket if you need further help.
              </Text>
            </View>
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
  contextMeta: { marginBottom: 16, fontSize: 12, color: Colors.gray[600] },
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
  attachmentList: { marginTop: 8, gap: 6 },
  attachmentPill: { borderRadius: 10, backgroundColor: "#E5E7EB", paddingHorizontal: 10, paddingVertical: 7 },
  attachmentPillOwn: { backgroundColor: "rgba(255,255,255,0.18)" },
  attachmentText: { fontSize: 12, fontWeight: "600", color: Colors.gray[700] },
  attachmentTextOwn: { color: "#fff" },
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
  pendingAttachments: { marginBottom: 10, gap: 6 },
  pendingAttachment: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    backgroundColor: Colors.gray[100],
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pendingAttachmentText: { flex: 1, marginRight: 8, fontSize: 12, color: Colors.gray[700] },
  pendingRemove: { fontSize: 12, fontWeight: "700", color: "#DC2626" },
  attachBtn: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingVertical: 12,
    alignItems: "center",
  },
  attachBtnText: { fontSize: 14, fontWeight: "600", color: Colors.primary },
  sendBtn: {
    borderRadius: 12,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontWeight: "600", color: "#fff", fontSize: 16 },
  closedNote: { marginTop: 16, fontSize: 14, color: Colors.gray[500] },
  csatBlock: { marginTop: 16 },
  csatRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  csatChip: { minWidth: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], paddingVertical: 10, alignItems: "center" },
  csatChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  csatText: { fontWeight: "700", color: Colors.gray[700] },
  csatTextActive: { color: "#fff" },
  csatInput: {
    marginBottom: 10,
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.gray[900],
  },
});
