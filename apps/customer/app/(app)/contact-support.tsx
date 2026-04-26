import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import {
  SUPPORT_TICKET_DEFAULT_CATEGORY,
  SUPPORT_TICKET_PRIORITIES,
} from "@/lib/supportTicketCategoryPresets";
import { SupportTicketCategoryPicker } from "@/components/SupportTicketCategoryPicker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { trackSupportTicketCreated } from "@/lib/analytics";

export default function ContactSupportScreen() {
  useScreenTracking("Contact support");
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(SUPPORT_TICKET_DEFAULT_CATEGORY);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const sub = subject.trim();
    const msg = message.trim();
    if (!sub || !msg) {
      Alert.alert("Missing fields", "Please enter a subject and message.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const res = await api.post<{ ticket?: { ticket_number?: string } }>("/api/me/support-tickets", {
        subject: sub,
        message: msg,
        priority,
        category,
      });
      if (res.error) {
        Alert.alert("Could not send", getApiErrorMessage(res.error, "Please try again."));
        return;
      }
      const ticketNumber = res.data?.ticket?.ticket_number;
      if (ticketNumber) trackSupportTicketCreated(ticketNumber);
      setSubject("");
      setMessage("");
      const alertBody = ticketNumber
        ? `Your support ticket has been created. Your ticket number is ${ticketNumber}. We'll get back to you soon.`
        : "Your support ticket has been created. We'll get back to you soon.";
      Alert.alert("Ticket sent", alertBody, [
        { text: "View tickets", onPress: () => router.push("/(app)/(tabs)/support-tickets" as never) },
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Could not send", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/support-tickets" as never);
          }}
          style={styles.ticketsRow}
          activeOpacity={0.7}
          accessibilityLabel="My support tickets. View and reply to your tickets."
          accessibilityRole="button"
        >
          <View style={styles.ticketsIconWrap}>
            <Ionicons name="chatbubbles-outline" size={22} color="#4f46e5" />
          </View>
          <View style={styles.ticketsTextWrap}>
            <Text style={styles.ticketsTitle}>My support tickets</Text>
            <Text style={styles.ticketsSubtitle}>View and reply to your tickets</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Submit a new ticket</Text>

        <View style={styles.fieldGap}>
          <SupportTicketCategoryPicker value={category} onChange={setCategory} />
        </View>

        <Text style={styles.priorityLabel}>Priority</Text>
        <View style={styles.priorityRow}>
          {SUPPORT_TICKET_PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p.value}
              onPress={() => setPriority(p.value)}
              style={[
                styles.priorityChip,
                priority === p.value ? styles.priorityChipActive : styles.priorityChipInactive,
              ]}
            >
              <Text style={[styles.priorityChipText, priority === p.value && styles.priorityChipTextActive]}>
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
          style={styles.input}
          accessibilityLabel="Ticket subject"
        />
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your issue or question..."
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.inputMultiline]}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Ticket message"
        />
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || !subject.trim() || !message.trim()}
          style={[styles.submitBtn, (!subject.trim() || !message.trim() || submitting) && styles.submitBtnDisabled]}
          activeOpacity={0.8}
          accessibilityLabel={submitting ? "Sending ticket" : "Send support ticket"}
          accessibilityRole="button"
        >
          <Text style={styles.submitBtnText}>{submitting ? "Sending…" : "Send ticket"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 },
  ticketsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    padding: 16,
    marginBottom: 24,
  },
  ticketsIconWrap: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#e0e7ff",
  },
  ticketsTextWrap: { marginLeft: 12, flex: 1 },
  ticketsTitle: { fontWeight: "600", color: Colors.gray[900] },
  ticketsSubtitle: { fontSize: 14, color: Colors.gray[500] },
  sectionLabel: { fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 },
  fieldGap: { marginBottom: 16 },
  priorityLabel: { fontSize: 12, fontWeight: "600", color: Colors.gray[600], marginBottom: 8 },
  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  priorityChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
  },
  priorityChipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}14` },
  priorityChipInactive: { borderColor: Colors.gray[200], backgroundColor: Colors.white },
  priorityChipText: { fontSize: 13, fontWeight: "600", color: Colors.gray[600] },
  priorityChipTextActive: { color: Colors.primary },
  input: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.gray[900],
  },
  inputMultiline: { minHeight: 120, marginBottom: 16 },
  submitBtn: {
    borderRadius: 12,
    backgroundColor: Colors.gray[900],
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontWeight: "600", color: Colors.white },
});
