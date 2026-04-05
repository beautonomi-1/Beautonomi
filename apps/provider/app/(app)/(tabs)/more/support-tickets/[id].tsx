import { useState, useEffect, useCallback, useRef } from "react";
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
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";
import { trackSupportTicketDetailView, trackSupportTicketReply } from "@/lib/analytics";

type Message = {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  user_id: string;
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
  const scrollViewRef = useRef<ScrollView>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

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
      const payload = res.data;
      const t = payload?.ticket ?? null;
      setTicket(t);
      setMessages(payload?.messages ?? []);
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

  // Scroll to bottom when messages update
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
      const res = await api.post(`/api/me/support-tickets/${id}/messages`, {
        message: msg,
      }) as { data?: unknown; error?: { message?: string } };
      if (res.error) {
        const errMsg = typeof res.error === "string" ? res.error : (res.error?.message ?? "Could not send reply");
        setSending(false);
        Alert.alert("Could not send", errMsg);
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
    <ScreenContainer>
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
            <Text style={twStyle("text-lg font-semibold text-gray-900 mb-4")}>{ticket.subject}</Text>

            {messages.map((m) => {
              const isOwn = m.user_id === user?.id;
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
                        <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>S</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: Colors.gray[500], fontWeight: "600" }}>Support Team</Text>
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
                <ActionButton
                  label={sending ? "Sending…" : "Send reply"}
                  onPress={handleReply}
                  fullWidth
                  disabled={sending || !reply.trim()}
                />
              </View>
            )}

            {(ticket.status === "closed" || ticket.status === "resolved") && (
              <Text style={twStyle("mt-4 text-sm text-gray-500")}>
                This ticket is {ticket.status}. Submit a new ticket from Settings → Contact support to
                continue.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
