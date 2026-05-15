import { useState, useEffect, useCallback, useRef } from "react";
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
  Linking,
  Image,
  AppState,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";
import { trackSupportTicketDetailView, trackSupportTicketReply } from "@/lib/analytics";
import { labelForSupportTicketCategory } from "@/lib/supportTicketCategoryPresets";
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
  name?: string;
  type?: string;
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

function statusColor(status: string): string {
  switch (status) {
    case "open":
      return "bg-blue-100";
    case "in_progress":
      return "bg-amber-100";
    case "resolved":
      return "bg-green-100";
    case "closed":
      return "bg-gray-100";
    default:
      return "bg-gray-100";
  }
}

export default function SupportTicketDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<SupportAttachment[]>([]);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [csatComment, setCsatComment] = useState("");
  const [submittingCsat, setSubmittingCsat] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const tid = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";
    if (!tid) return;
    void api.post("/api/provider/notifications/mark-related-read", { ticket_id: tid }).catch(() => {});
  }, [id]);

  const loadTicket = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const res = await api.get<{ ticket: Ticket; messages: Message[] }>(
        `/api/me/support-tickets/${id}`
      ) as { data?: { ticket?: Ticket; messages?: Message[] }; error?: { message?: string } };
      if (res.error) {
        setTicket(null);
        setMessages([]);
        setLoadError(typeof res.error === "string" ? res.error : (res.error?.message ?? "Could not load ticket"));
        return;
      }
      const payload = res.data as { ticket?: Ticket; messages?: Message[] } | null | undefined;
      const t = payload?.ticket ?? null;
      setTicket(t);
      setCsatScore(t?.csat_score ?? null);
      setCsatComment(t?.csat_comment ?? "");
      setMessages(Array.isArray(payload?.messages) ? payload!.messages! : []);
      void api.post(`/api/me/support-tickets/${id}/seen`, {}).catch(() => {});
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

  // Scroll to bottom when messages update
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
      }) as { data?: unknown; error?: { message?: string } };
      if (res.error) {
        const errMsg = typeof res.error === "string" ? res.error : (res.error?.message ?? "Could not send reply");
        setSending(false);
        Alert.alert("Could not send", errMsg);
        return;
      }
      setReply("");
      setPendingAttachments([]);
      trackSupportTicketReply(id);
      await loadTicket();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  const attachImage = async () => {
    if (!id || uploadingAttachment || pendingAttachments.length >= 6) return;
    setUploadingAttachment(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const formData = new FormData();
      appendFormDataFileNative(formData, "files", {
        uri: asset.uri,
        name: asset.fileName || "support-image.jpg",
        type: asset.mimeType || "image/jpeg",
      });
      const res = await api.fetch<{ attachments?: SupportAttachment[] }>(
        `/api/me/support-tickets/${id}/upload`,
        { method: "POST", body: formData },
      ) as { data?: { attachments?: SupportAttachment[] }; error?: { message?: string } | string };
      if (res.error) {
        const msg = typeof res.error === "string" ? res.error : res.error.message || "Could not upload image";
        Alert.alert("Could not upload", msg);
        return;
      }
      const attachments = res.data?.attachments ?? [];
      setPendingAttachments((prev) => [...prev, ...attachments].slice(0, 6));
    } catch (e) {
      Alert.alert("Could not upload", e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const openAttachment = (attachment: SupportAttachment) => {
    Linking.openURL(attachment.url).catch(() => Alert.alert("Could not open attachment"));
  };

  const submitCsat = async () => {
    if (!id || !csatScore) return;
    setSubmittingCsat(true);
    try {
      const res = await api.post(`/api/me/support-tickets/${id}/csat`, {
        score: csatScore,
        comment: csatComment.trim() || null,
      }) as { error?: { message?: string } | string };
      if (res.error) {
        Alert.alert("Could not submit rating", typeof res.error === "string" ? res.error : res.error.message || "Please try again");
        return;
      }
      invalidateSupportTicketsListCache();
      Alert.alert("Thanks", "Your rating helps us improve support.");
      await loadTicket();
    } catch (e) {
      Alert.alert("Could not submit rating", e instanceof Error ? e.message : "Please try again");
    } finally {
      setSubmittingCsat(false);
    }
  };

  if (!id) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Ticket" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center")}>
          <Text style={twStyle("text-gray-500")}>Invalid ticket</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (loading && !ticket) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Ticket" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center")}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </ScreenContainer>
    );
  }

  if (!ticket) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Ticket" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          {loadError ? (
            <ErrorState message={loadError} onRetry={loadTicket} />
          ) : (
            <>
              <Text style={twStyle("text-gray-500 text-center")}>Ticket not found</Text>
              <TouchableOpacity
                onPress={() => router.back()}
                style={twStyle("mt-4")}
                accessibilityLabel="Back to ticket list"
                accessibilityRole="button"
              >
                <Text style={twStyle("text-indigo-600 font-medium")}>Back to list</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const canReply = ticket.status !== "closed" && ticket.status !== "resolved";

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader title={ticket.ticket_number} onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={twStyle("flex-1")}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          style={twStyle("flex-1")}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={twStyle("px-2 pt-2")}>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <View style={twStyle(`rounded-full px-2 py-1 ${statusColor(ticket.status)}`)}>
                <Text style={twStyle("text-xs font-medium text-gray-800")}>
                  {ticket.status.replace("_", " ")}
                </Text>
              </View>
              <Text style={twStyle("text-xs text-gray-500")}>
                {formatDateSafe(ticket.created_at)}
              </Text>
            </View>
            <Text style={twStyle("text-lg font-semibold text-gray-900 mb-2")}>{ticket.subject}</Text>
            <Text style={twStyle("mb-4 text-xs text-gray-500")}>
              {ticket.category
                ? `Category: ${labelForSupportTicketCategory(String(ticket.category))} · `
                : ""}
              Priority: {ticket.priority}
            </Text>
            {ticket.support_context_type ? (
              <Text style={twStyle("mb-4 text-xs text-gray-600")}>
                About: {ticket.support_context_type.replace(/_/g, " ")}
                {ticket.support_context_label ? ` · ${ticket.support_context_label}` : ""}
              </Text>
            ) : null}

            {messages.map((m) => {
              const isOwn = m.is_mine ?? (m.user_id === user?.id);
              const authorLabel = isOwn ? "You" : (m.author_name ?? "Support Team");
              const initials = authorLabel === "You" ? "Me" : authorLabel.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              const attachments = Array.isArray(m.attachments) ? m.attachments : [];
              return (
                <View
                  key={m.id}
                  style={{
                    marginBottom: 10,
                    alignItems: isOwn ? "flex-end" : "flex-start",
                  }}
                >
                  {!isOwn && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3, gap: 4 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{initials}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: Colors.gray[500], fontWeight: "600" }}>{authorLabel}</Text>
                    </View>
                  )}
                  <View
                    style={{
                      maxWidth: "80%",
                      borderRadius: 16,
                      borderBottomRightRadius: isOwn ? 4 : 16,
                      borderBottomLeftRadius: isOwn ? 16 : 4,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: isOwn ? Colors.primary : "#F3F4F6",
                    }}
                  >
                    <Text style={{ fontSize: 14, color: isOwn ? "#fff" : "#111827", lineHeight: 20 }}>
                      {m.message}
                    </Text>
                    {attachments.length > 0 && (
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {attachments.map((attachment, index) => {
                          const isImage = Boolean(attachment.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(attachment.url));
                          return (
                            <TouchableOpacity
                              key={`${m.id}-att-${index}`}
                              onPress={() => openAttachment(attachment)}
                              style={{
                                overflow: "hidden",
                                borderRadius: 10,
                                backgroundColor: isOwn ? "rgba(255,255,255,0.16)" : "#E5E7EB",
                              }}
                              accessibilityRole="button"
                            >
                              {isImage ? (
                                <Image source={{ uri: attachment.url }} style={{ height: 120, width: 220 }} resizeMode="cover" />
                              ) : null}
                              <Text
                                numberOfLines={1}
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 8,
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: isOwn ? "#fff" : Colors.gray[700],
                                }}
                              >
                                📎 {attachment.name || `Attachment ${index + 1}`}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <Text style={{ marginTop: 4, fontSize: 10, color: isOwn ? "rgba(255,255,255,0.65)" : "#9CA3AF", textAlign: isOwn ? "right" : "left" }}>
                      {formatDateTimeSafe(m.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })}

            {canReply && (
              <View style={twStyle("mt-4")}>
                <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Add a reply</Text>
                <TextInput
                  style={twStyle("mb-3 min-h-[100px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                  placeholder="Type your message..."
                  placeholderTextColor="#9ca3af"
                  value={reply}
                  onChangeText={setReply}
                  multiline
                  editable={!sending}
                />
                {pendingAttachments.length > 0 && (
                  <View style={{ marginBottom: 10, gap: 6 }}>
                    {pendingAttachments.map((attachment, index) => (
                      <View
                        key={`${attachment.url}-${index}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderRadius: 10,
                          backgroundColor: Colors.gray[100],
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text numberOfLines={1} style={{ flex: 1, marginRight: 8, fontSize: 12, color: Colors.gray[700] }}>
                          {attachment.name || `Attachment ${index + 1}`}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== index))}
                          accessibilityRole="button"
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#DC2626" }}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity
                  onPress={attachImage}
                  disabled={sending || uploadingAttachment || pendingAttachments.length >= 6}
                  style={twStyle("mb-3 rounded-xl border border-gray-200 py-3 items-center")}
                  accessibilityRole="button"
                >
                  {uploadingAttachment ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={twStyle("text-indigo-600 font-semibold")}>Attach image</Text>
                  )}
                </TouchableOpacity>
                <ActionButton
                  label={sending ? "Sending…" : "Send reply"}
                  onPress={handleReply}
                  fullWidth
                  disabled={sending || (!reply.trim() && pendingAttachments.length === 0)}
                />
              </View>
            )}

            {(ticket.status === "closed" || ticket.status === "resolved") && (
              <View style={twStyle("mt-4")}>
                <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
                  {typeof ticket.csat_score === "number" ? "Your support rating" : "Rate this support experience"}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <TouchableOpacity
                      key={score}
                      onPress={() => setCsatScore(score)}
                      style={{
                        minWidth: 44,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: csatScore === score ? Colors.primary : Colors.gray[200],
                        backgroundColor: csatScore === score ? Colors.primary : "#fff",
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: csatScore === score }}
                    >
                      <Text style={{ fontWeight: "700", color: csatScore === score ? "#fff" : Colors.gray[700] }}>{score}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={twStyle("mb-3 min-h-[72px] rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-900")}
                  placeholder="Optional comment"
                  placeholderTextColor="#9ca3af"
                  value={csatComment}
                  onChangeText={setCsatComment}
                  multiline
                  maxLength={1000}
                />
                <ActionButton
                  label={
                    submittingCsat ? "Submitting…" : typeof ticket.csat_score === "number" ? "Update rating" : "Submit rating"
                  }
                  onPress={submitCsat}
                  fullWidth
                  disabled={!csatScore || submittingCsat}
                />
                <Text style={twStyle("mt-4 text-sm text-gray-500")}>
                  This ticket is {ticket.status}. Submit a new ticket from Settings → Contact support to continue.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
