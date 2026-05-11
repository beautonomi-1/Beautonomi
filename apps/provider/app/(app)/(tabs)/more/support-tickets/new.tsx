import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";
import { twStyle } from "@/lib/twStyle";
import {
  SUPPORT_TICKET_DEFAULT_CATEGORY,
  SUPPORT_TICKET_PRIORITIES,
} from "@/lib/supportTicketCategoryPresets";
import { SupportTicketCategoryPicker } from "@/components/SupportTicketCategoryPicker";

const SUPPORT_CONTEXT_OPTIONS = [
  { value: "booking", label: "Booking" },
  { value: "product_order", label: "Product order" },
  { value: "payment", label: "Payment/refund" },
  { value: "provider_onboarding", label: "Onboarding" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
] as const;

export default function NewSupportTicketScreen() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(SUPPORT_TICKET_DEFAULT_CATEGORY);
  const [supportContextType, setSupportContextType] = useState<(typeof SUPPORT_CONTEXT_OPTIONS)[number]["value"]>("booking");
  const [supportContextLabel, setSupportContextLabel] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);

  /**
   * §Provider-audit 2026-05: previously the Submit button silently stayed
   * disabled until subject ≥ 4 chars and message ≥ 10 chars, with no hint
   * about what the user needed to do. That made the button feel "greyed out
   * and broken". The API itself only requires both fields to be non-empty,
   * so we mirror that minimum and surface inline hints + an Alert when the
   * user taps a still-disabled button so the experience is honest.
   */
  const subjectTrimmed = subject.trim();
  const messageTrimmed = message.trim();
  const subjectOk = subjectTrimmed.length >= 1;
  const messageOk = messageTrimmed.length >= 1;
  const canSubmit = subjectOk && messageOk;
  const subjectHint =
    subjectTrimmed.length === 0
      ? "Required — short summary of the issue"
      : subjectTrimmed.length < 4
        ? "Tip: a few more words helps us route it faster"
        : null;
  const messageHint =
    messageTrimmed.length === 0
      ? "Required — describe what happened"
      : messageTrimmed.length < 10
        ? "Tip: include any error or steps so we can help fast"
        : null;

  const handleSubmit = async () => {
    if (!canSubmit) {
      const missing: string[] = [];
      if (!subjectOk) missing.push("a short subject");
      if (!messageOk) missing.push("a description of the issue");
      Alert.alert(
        "A little more info",
        `Please add ${missing.join(" and ")} so we can help.`,
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const res = await api.post("/api/me/support-tickets", {
        subject: subjectTrimmed,
        message: messageTrimmed,
        category,
        priority,
        support_context_type: supportContextType,
        support_context_label: supportContextLabel.trim() || null,
      }) as { error?: { message?: string } };
      if (res.error) {
        Alert.alert("Could not submit", typeof res.error === "string" ? res.error : (res.error?.message ?? "Please try again"));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Ticket submitted",
        "We'll get back to you as soon as possible. You can track replies in your support tickets.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title="New support ticket" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginBottom: 16 }}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>What is this about?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {SUPPORT_CONTEXT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setSupportContextType(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: supportContextType === option.value }}
                  style={{
                    borderRadius: 20,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderWidth: 1.5,
                    borderColor: supportContextType === option.value ? Colors.primary : Colors.gray[200],
                    backgroundColor: supportContextType === option.value ? `${Colors.primary}12` : "#fff",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: supportContextType === option.value ? Colors.primary : Colors.gray[600] }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Related reference (optional)</Text>
            <TextInput
              style={{
                marginBottom: 20,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: "#FAFAFA",
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: "#111827",
              }}
              placeholder="Booking/order/payment reference"
              placeholderTextColor="#9CA3AF"
              value={supportContextLabel}
              onChangeText={setSupportContextLabel}
              maxLength={160}
            />
            <SupportTicketCategoryPicker value={category} onChange={setCategory} />
          </View>

          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Priority</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {SUPPORT_TICKET_PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p.value}
                onPress={() => setPriority(p.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: priority === p.value }}
                style={{
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1.5,
                  borderColor: priority === p.value ? Colors.primary : Colors.gray[200],
                  backgroundColor: priority === p.value ? `${Colors.primary}12` : "#fff",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: priority === p.value ? Colors.primary : Colors.gray[600] }}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Subject */}
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Subject</Text>
          <TextInput
            style={{
              marginBottom: subjectHint ? 6 : 20,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              backgroundColor: "#FAFAFA",
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: "#111827",
            }}
            placeholder="Brief description of the issue"
            placeholderTextColor="#9CA3AF"
            value={subject}
            onChangeText={setSubject}
            maxLength={160}
            returnKeyType="next"
          />
          {subjectHint ? (
            <Text style={{ marginBottom: 16, fontSize: 12, color: Colors.gray[500] }}>{subjectHint}</Text>
          ) : null}

          {/* Message */}
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Details</Text>
          <TextInput
            style={{
              marginBottom: messageHint ? 6 : 24,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              backgroundColor: "#FAFAFA",
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: "#111827",
              minHeight: 140,
              textAlignVertical: "top",
            }}
            placeholder="Describe the issue in detail, including any error messages or steps to reproduce…"
            placeholderTextColor="#9CA3AF"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
          />
          {messageHint ? (
            <Text style={{ marginBottom: 20, fontSize: 12, color: Colors.gray[500] }}>{messageHint}</Text>
          ) : null}

          <ActionButton
            label={submitting ? "Submitting…" : "Submit ticket"}
            onPress={handleSubmit}
            variant="brand"
            fullWidth
            disabled={submitting}
          />
          <Text style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: Colors.gray[400] }}>
            We typically respond within 1–2 business days
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
