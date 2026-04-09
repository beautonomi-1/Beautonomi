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

const CATEGORIES = [
  { value: "billing", label: "Billing & subscription" },
  { value: "technical", label: "Technical issue" },
  { value: "bookings", label: "Bookings & scheduling" },
  { value: "account", label: "Account & access" },
  { value: "other", label: "Other" },
];

export default function NewSupportTicketScreen() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("other");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = subject.trim().length >= 4 && message.trim().length >= 10;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const res = await api.post("/api/me/support-tickets", {
        subject: subject.trim(),
        message: message.trim(),
        category,
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
          {/* Category */}
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Category</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                onPress={() => setCategory(c.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: category === c.value }}
                style={{
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1.5,
                  borderColor: category === c.value ? Colors.primary : Colors.gray[200],
                  backgroundColor: category === c.value ? `${Colors.primary}12` : "#fff",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: category === c.value ? Colors.primary : Colors.gray[600] }}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Subject */}
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Subject</Text>
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
            placeholder="Brief description of the issue"
            placeholderTextColor="#9CA3AF"
            value={subject}
            onChangeText={setSubject}
            maxLength={160}
            returnKeyType="next"
          />

          {/* Message */}
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Details</Text>
          <TextInput
            style={{
              marginBottom: 24,
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

          <ActionButton
            label={submitting ? "Submitting…" : "Submit ticket"}
            onPress={handleSubmit}
            fullWidth
            disabled={!canSubmit || submitting}
          />
          <Text style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: Colors.gray[400] }}>
            We typically respond within 1–2 business days
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
