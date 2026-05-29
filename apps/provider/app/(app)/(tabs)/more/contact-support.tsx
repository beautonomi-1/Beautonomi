import { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import {
  SUPPORT_TICKET_DEFAULT_CATEGORY,
  SUPPORT_TICKET_PRIORITIES,
} from "@/lib/supportTicketCategoryPresets";
import { SupportTicketCategoryPicker } from "@/components/SupportTicketCategoryPicker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";
import { trackSupportTicketCreated } from "@/lib/analytics";
import { SUPPORT_TICKETS_API_PREFIX } from "@/lib/support-ticket-api";

export default function ContactSupportScreen() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(SUPPORT_TICKET_DEFAULT_CATEGORY);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const { execute: createTicket, loading: submitting } = useApiMutation("post");

  const handleSubmit = async () => {
    const sub = subject.trim();
    const msg = message.trim();
    if (!sub || !msg) {
      Alert.alert("Missing fields", "Please enter a subject and message.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await createTicket(SUPPORT_TICKETS_API_PREFIX, {
      subject: sub,
      message: msg,
      priority,
      category,
    });
    if (!res.error) {
      const ticketNumber = (res as { data?: { ticket?: { ticket_number?: string } } })?.data?.ticket?.ticket_number;
      if (ticketNumber) trackSupportTicketCreated(ticketNumber);
      setSubject("");
      setMessage("");
      const alertBody = ticketNumber
        ? `Your support ticket has been created. Your ticket number is ${ticketNumber}. We'll get back to you soon.`
        : "Your support ticket has been created. We'll get back to you soon.";
      Alert.alert("Ticket sent", alertBody, [
        { text: "View tickets", onPress: () => router.push("/(app)/(tabs)/more/support-tickets" as never) },
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Alert.alert("Could not send", res.error ?? "Please try again.");
    }
  };

  return (
    <ScreenContainer scrollable={false} keyboardAvoiding={false}>
      <ScreenHeader title="Contact support" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
        <View style={{ paddingHorizontal: 8, paddingTop: 16 }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/support-tickets" as never);
            }}
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16, marginBottom: 24 }}
            activeOpacity={0.7}
            accessibilityLabel="My support tickets. View and reply to your tickets."
            accessibilityRole="button"
          >
            <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#e0e7ff" }}>
              <Ionicons name="chatbubbles-outline" size={22} color="#4f46e5" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>My support tickets</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[500] }}>View and reply to your tickets</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>

          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>Submit a new ticket</Text>

          <View style={{ marginBottom: 16 }}>
            <SupportTicketCategoryPicker value={category} onChange={setCategory} />
          </View>

          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[600], marginBottom: 8 }}>Priority</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {SUPPORT_TICKET_PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p.value}
                onPress={() => setPriority(p.value)}
                style={{
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1.5,
                  borderColor: priority === p.value ? Colors.primary : Colors.gray[200],
                  backgroundColor: priority === p.value ? `${Colors.primary}14` : Colors.white,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: priority === p.value ? Colors.primary : Colors.gray[600],
                  }}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor="#9ca3af"
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            accessibilityLabel="Ticket subject"
            accessibilityRole="none"
          />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your issue or question..."
            placeholderTextColor="#9ca3af"
            style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900], minHeight: 120 }}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Ticket message"
            accessibilityRole="none"
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting || !subject.trim() || !message.trim()}
            style={{ borderRadius: 12, backgroundColor: Colors.gray[900], paddingVertical: 12, alignItems: "center" }}
            activeOpacity={0.8}
            accessibilityLabel={submitting ? "Sending ticket" : "Send support ticket"}
            accessibilityRole="button"
          >
            <Text style={{ fontWeight: "500", color: Colors.white }}>
              {submitting ? "Sending…" : "Send ticket"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
