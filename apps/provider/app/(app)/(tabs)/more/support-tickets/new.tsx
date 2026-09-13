import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, ScrollView, Alert, Platform, TouchableOpacity } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { TrustScreenShell } from "@/components/safety/TrustScreenShell";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";
import { twStyle } from "@/lib/twStyle";
import {
  SUPPORT_TICKET_DEFAULT_CATEGORY,
  SUPPORT_TICKET_PRIORITIES,
  supportTicketPresetFromCategory,
} from "@/lib/supportTicketCategoryPresets";
import { SupportTicketCategoryPicker } from "@/components/SupportTicketCategoryPicker";
import { SUPPORT_TICKETS_API_PREFIX } from "@/lib/support-ticket-api";
import { invalidateSupportTicketsListCache } from "@/lib/api-response-cache";
import { resolveSupportTicketPrefillFromSearch, shouldSendSupportContextId } from "@beautonomi/utils";

const SUPPORT_CONTEXT_OPTIONS = [
  { value: "booking", labelKey: "contextBooking" },
  { value: "product_order", labelKey: "contextProductOrder" },
  { value: "payment", labelKey: "contextPayment" },
  { value: "provider_onboarding", labelKey: "contextProviderOnboarding" },
  { value: "account", labelKey: "contextAccount" },
  { value: "technical", labelKey: "contextTechnical" },
  { value: "other", labelKey: "contextOther" },
] as const;

const PRIORITY_LABEL_KEYS: Record<(typeof SUPPORT_TICKET_PRIORITIES)[number]["value"], string> = {
  low: "priorityLow",
  medium: "priorityMedium",
  high: "priorityHigh",
  urgent: "priorityUrgent",
};

export default function NewSupportTicketScreen() {
  const { t } = useTranslation();
  const st = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.supportTicketNew.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; booking_id?: string; booking_number?: string }>();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(SUPPORT_TICKET_DEFAULT_CATEGORY);
  const [supportContextType, setSupportContextType] = useState<(typeof SUPPORT_CONTEXT_OPTIONS)[number]["value"]>("booking");
  const [supportContextLabel, setSupportContextLabel] = useState("");
  const [supportContextId, setSupportContextId] = useState<string | null>(null);
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
    const prefill = resolveSupportTicketPrefillFromSearch({
      bookingId: typeof params.booking_id === "string" ? params.booking_id : null,
      bookingNumber: typeof params.booking_number === "string" ? params.booking_number : null,
      category: preset || null,
    });
    if (prefill.supportContextType === "booking" || prefill.supportContextType === "product_order") {
      setSupportContextType(prefill.supportContextType);
      setSupportContextLabel(prefill.supportContextLabel);
      setSupportContextId(prefill.supportContextId);
      if (!preset) {
        setSubject((current) =>
          current.trim()
            ? current
            : st("helpWithBooking", { label: prefill.supportContextLabel.split(" (")[0] }),
        );
      }
    }
  }, [params.category, params.booking_id, params.booking_number, st]);

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
      ? st("subjectHintRequired")
      : subjectTrimmed.length < 4
        ? st("subjectHintTip")
        : null;
  const messageHint =
    messageTrimmed.length === 0
      ? st("messageHintRequired")
      : messageTrimmed.length < 10
        ? st("messageHintTip")
        : null;

  const handleSubmit = async () => {
    if (!canSubmit) {
      const missing: string[] = [];
      if (!subjectOk) missing.push(st("missingSubject"));
      if (!messageOk) missing.push(st("missingDescription"));
      Alert.alert(
        st("moreInfoTitle"),
        st("moreInfoBody", { missing: missing.join(st("missingJoin")) }),
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const res = await api.post<{ ticket?: { id?: string; ticket_number?: string } }>(
        SUPPORT_TICKETS_API_PREFIX,
        {
          subject: subjectTrimmed,
          message: messageTrimmed,
          category,
          priority,
          support_context_type: supportContextType,
          support_context_id: shouldSendSupportContextId(supportContextType) ? supportContextId : null,
          support_context_label: supportContextLabel.trim() || null,
        }
      );
      if (res.error) {
        Alert.alert(st("submitFailedTitle"), res.error.message ?? st("submitFailedFallback"));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateSupportTicketsListCache();
      const ticketId = res.data?.ticket?.id;
      if (ticketId) {
        // Navigate to the created ticket so the provider can track replies.
        router.replace(`/(app)/(tabs)/more/support-tickets/${ticketId}` as never);
      } else {
        Alert.alert(
          st("submittedTitle"),
          st("submittedBody"),
          [{ text: st("ok"), onPress: () => router.back() }]
        );
      }
    } catch (e) {
      Alert.alert(st("errorTitle"), e instanceof Error ? e.message : st("submitGenericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <TrustScreenShell
        title={st("screenTitle")}
        breadcrumbSegment={st("breadcrumb")}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginBottom: 16 }}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{st("aboutLabel")}</Text>
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
                    {st(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{st("referenceLabel")}</Text>
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
              placeholder={st("referencePlaceholder")}
              placeholderTextColor="#9CA3AF"
              value={supportContextLabel}
              onChangeText={setSupportContextLabel}
              maxLength={160}
            />
            <SupportTicketCategoryPicker value={category} onChange={setCategory} />
          </View>

          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{st("priorityLabel")}</Text>
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
                  {st(PRIORITY_LABEL_KEYS[p.value])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Subject */}
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{st("subjectLabel")}</Text>
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
            placeholder={st("subjectPlaceholder")}
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
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{st("detailsLabel")}</Text>
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
            placeholder={st("detailPlaceholder")}
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
            label={submitting ? st("submitting") : st("submitTicket")}
            onPress={handleSubmit}
            variant="brand"
            fullWidth
            disabled={submitting}
          />
          <Text style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: Colors.gray[400] }}>
            {st("responseHint")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
