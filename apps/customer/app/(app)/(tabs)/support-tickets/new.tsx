import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, TextInput, ScrollView, Alert, Platform, TouchableOpacity, StyleSheet } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import {
  SUPPORT_TICKET_DEFAULT_CATEGORY,
  SUPPORT_TICKET_PRIORITIES,
  supportTicketPresetFromCategory,
} from "@/lib/supportTicketCategoryPresets";
import { SupportTicketCategoryPicker } from "@/components/SupportTicketCategoryPicker";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { trackSupportTicketCreated } from "@/lib/analytics";

const SUPPORT_CONTEXT_OPTIONS = [
  { value: "booking", label: "Booking" },
  { value: "product_order", label: "Product order" },
  { value: "gift_card", label: "Gift card" },
  { value: "payment", label: "Payment/refund" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
] as const;

export default function NewSupportTicketScreen() {
  useScreenTracking("New support ticket");
  const { t } = useTranslation();
  const sn = useCallback((key: string) => t(`customer.mobile.screens.supportTicketsNew.${key}`), [t]);
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; booking_id?: string }>();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(SUPPORT_TICKET_DEFAULT_CATEGORY);
  const [supportContextType, setSupportContextType] = useState<(typeof SUPPORT_CONTEXT_OPTIONS)[number]["value"]>("booking");
  const [supportContextLabel, setSupportContextLabel] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const preset = typeof params.category === "string" ? params.category.trim() : "";
    if (preset) {
      setCategory(preset);
      const derived = supportTicketPresetFromCategory(preset);
      if (derived.priority) setPriority(derived.priority);
      if (derived.subject) setSubject(derived.subject);
    }
    if (typeof params.booking_id === "string" && params.booking_id.trim()) {
      setSupportContextType("booking");
      setSupportContextLabel(params.booking_id.trim());
    }
  }, [params.category, params.booking_id]);

  const canSubmit = subject.trim().length >= 4 && message.trim().length >= 10;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const res = await api.post<{ ticket?: { ticket_number?: string } }>("/api/me/support-tickets", {
        subject: subject.trim(),
        message: message.trim(),
        category,
        priority,
        support_context_type: supportContextType,
        support_context_label: supportContextLabel.trim() || null,
      });
      if (res.error) {
        Alert.alert(sn("submitFailedTitle"), getApiErrorMessage(res.error, sn("submitFailedFallback")));
        return;
      }
      const ticketNumber = res.data?.ticket?.ticket_number;
      if (ticketNumber) trackSupportTicketCreated(ticketNumber);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(sn("submittedTitle"), sn("submittedBody"), [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert(
        t("customer.mobile.screens.authLogin.errorTitle"),
        e instanceof Error ? e.message : sn("submitGenericError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.fieldGap}>
          <Text style={styles.label}>What is this about?</Text>
          <View style={styles.contextRow}>
            {SUPPORT_CONTEXT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setSupportContextType(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: supportContextType === option.value }}
                style={[
                  styles.contextChip,
                  supportContextType === option.value ? styles.priorityChipActive : styles.priorityChipInactive,
                ]}
              >
                <Text style={[styles.priorityChipText, supportContextType === option.value && styles.priorityChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Related reference (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Booking/order/payment reference"
            placeholderTextColor="#9CA3AF"
            value={supportContextLabel}
            onChangeText={setSupportContextLabel}
            maxLength={160}
          />
          <SupportTicketCategoryPicker value={category} onChange={setCategory} />
        </View>

        <Text style={styles.label}>Priority</Text>
        <View style={styles.priorityRow}>
          {SUPPORT_TICKET_PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p.value}
              onPress={() => setPriority(p.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: priority === p.value }}
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

        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.input}
          placeholder="Brief description of the issue"
          placeholderTextColor="#9CA3AF"
          value={subject}
          onChangeText={setSubject}
          maxLength={160}
          returnKeyType="next"
        />

        <Text style={styles.label}>Details</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Describe the issue in detail, including any error messages or steps to reproduce…"
          placeholderTextColor="#9CA3AF"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
        />

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.submitBtnText}>{submitting ? "Submitting…" : "Submit ticket"}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>We typically respond within 1–2 business days</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 220 },
  fieldGap: { marginBottom: 16 },
  label: { marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] },
  contextRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  contextChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5 },
  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  priorityChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5 },
  priorityChipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}12` },
  priorityChipInactive: { borderColor: Colors.gray[200], backgroundColor: "#fff" },
  priorityChipText: { fontSize: 13, fontWeight: "600", color: Colors.gray[600] },
  priorityChipTextActive: { color: Colors.primary },
  input: {
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  inputMultiline: { minHeight: 140, textAlignVertical: "top", marginBottom: 24 },
  submitBtn: {
    borderRadius: 12,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontWeight: "600", color: "#fff", fontSize: 16 },
  hint: { marginTop: 12, textAlign: "center", fontSize: 12, color: Colors.gray[400] },
});
