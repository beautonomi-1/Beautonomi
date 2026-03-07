import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

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
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadTicket = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<{ ticket: Ticket; messages: Message[] }>(
        `/api/me/support-tickets/${id}`
      ) as { data?: { ticket?: Ticket; messages?: Message[] }; error?: { message?: string } };
      if (res.error) {
        setTicket(null);
        setMessages([]);
        return;
      }
      const payload = res.data;
      setTicket(payload?.ticket ?? null);
      setMessages(payload?.messages ?? []);
    } catch {
      setTicket(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

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
        setSending(false);
        return;
      }
      setReply("");
      await loadTicket();
    } catch {
      // ignore
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
        <View style={twStyle("flex-1 items-center justify-center px-4")}>
          <Text style={twStyle("text-gray-500 text-center")}>Ticket not found</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={twStyle("mt-4")}
            accessibilityLabel="Back to ticket list"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-indigo-600 font-medium")}>Back to list</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const canReply = ticket.status !== "closed" && ticket.status !== "resolved";

  return (
    <ScreenContainer>
      <ScreenHeader title={ticket.ticket_number} onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={twStyle("flex-1")}
      >
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
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
                {new Date(ticket.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={twStyle("text-lg font-semibold text-gray-900 mb-4")}>{ticket.subject}</Text>

            {messages.map((m) => (
              <View key={m.id} style={twStyle("mb-3 rounded-xl bg-gray-50 p-3")}>
                <Text style={twStyle("text-sm text-gray-800")}>{m.message}</Text>
                <Text style={twStyle("mt-2 text-xs text-gray-400")}>
                  {new Date(m.created_at).toLocaleString()}
                </Text>
              </View>
            ))}

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
