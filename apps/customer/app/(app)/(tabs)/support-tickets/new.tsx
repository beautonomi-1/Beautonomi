import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, TextInput, ScrollView, Alert, Platform, TouchableOpacity, StyleSheet } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import { useSafetyStackBack } from "@/lib/customer-safety-navigation";
import { SUPPORT_TICKET_PRIORITIES, supportTicketPresetFromCategory } from "@/lib/supportTicketCategoryPresets";
import { SupportTicketCategoryPicker } from "@/components/SupportTicketCategoryPicker";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { trackSupportTicketCreated } from "@/lib/analytics";
import {
  contextTypeForCategory,
  isSelectableForAudience,
  resolveSupportTicketPrefillFromSearch,
  shouldSendSupportContextId,
  isSafetySupportCategory,
} from "@beautonomi/utils";
import { useFeatureFlag, useSupportAssistantActive } from "@/providers/ConfigBundleProvider";

const PRIORITY_LABEL_KEYS: Record<(typeof SUPPORT_TICKET_PRIORITIES)[number]["value"], string> = {
  low: "priorityLow",
  medium: "priorityMedium",
  high: "priorityHigh",
  urgent: "priorityUrgent",
};

function NewTicketBackButton() {
  const { t } = useTranslation();
  const handleBack = useSafetyStackBack();
  return (
    <TouchableOpacity
      onPress={handleBack}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
      accessibilityLabel={t("common.back")}
      accessibilityRole="button"
      style={{ marginStart: Platform.OS === "ios" ? 8 : 4, padding: 4 }}
    >
      <DirectionalIcon name="chevron-back" size={26} color={Colors.primary} />
    </TouchableOpacity>
  );
}

export default function NewSupportTicketScreen() {
  useScreenTracking("New support ticket");
  const { t } = useTranslation();
  const sn = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`customer.mobile.screens.supportTicketNew.${key}`, opts) as string,
    [t],
  );
  const handleBack = useSafetyStackBack();
  const router = useRouter();
  const assistantFlagOn = useFeatureFlag("support.ai_assistant.customer");
  const assistantAgentActive = useSupportAssistantActive();
  const assistantEnabled = assistantFlagOn && assistantAgentActive;
  const [chatStep, setChatStep] = useState<"category" | "chat" | "form">("form");
  const params = useLocalSearchParams<{
    category?: string;
    booking_id?: string;
    booking_number?: string;
    order_id?: string;
    order_number?: string;
    gift_card_id?: string;
    gift_card_code?: string;
  }>();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("");
  const [supportContextType, setSupportContextType] = useState<string | null>(null);
  const [supportContextLabel, setSupportContextLabel] = useState("");
  const [supportContextId, setSupportContextId] = useState<string | null>(null);
  const [prefillLocked, setPrefillLocked] = useState(false);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const preset = typeof params.category === "string" ? params.category.trim() : "";
    if (preset && isSelectableForAudience(preset, "customer")) {
      setCategory(preset);
      const derived = supportTicketPresetFromCategory(preset);
      if (derived.priority) setPriority(derived.priority);
      if (derived.subject) setSubject(derived.subject);
    }
    const prefill = resolveSupportTicketPrefillFromSearch({
      bookingId: typeof params.booking_id === "string" ? params.booking_id : null,
      bookingNumber: typeof params.booking_number === "string" ? params.booking_number : null,
      orderId: typeof params.order_id === "string" ? params.order_id : null,
      orderNumber: typeof params.order_number === "string" ? params.order_number : null,
      giftCardId: typeof params.gift_card_id === "string" ? params.gift_card_id : null,
      giftCardCode: typeof params.gift_card_code === "string" ? params.gift_card_code : null,
      category: preset || null,
    });
    if (prefill.supportContextType) {
      setSupportContextType(prefill.supportContextType);
      setSupportContextLabel(prefill.supportContextLabel);
      setSupportContextId(prefill.supportContextId);
      setPrefillLocked(true);
      if (!preset) {
        const kind =
          prefill.supportContextType === "product_order"
            ? sn("helpKindOrder")
            : prefill.supportContextType === "gift_card"
              ? sn("helpKindGiftCard")
              : sn("helpKindBooking");
        setSubject((current) =>
          current.trim()
            ? current
            : sn("helpWithSubject", { kind, label: prefill.supportContextLabel.split(" (")[0] }),
        );
      }
    }
  }, [params.category, params.booking_id, params.booking_number, params.order_id, params.order_number, params.gift_card_id, params.gift_card_code, sn]);

  useEffect(() => {
    setChatStep(assistantEnabled ? "category" : "form");
  }, [assistantEnabled]);

  const canSubmit = category.trim().length > 0 && subject.trim().length >= 4 && message.trim().length >= 10;
  const canStartChat =
    category.trim().length > 0 && message.trim().length >= 10 && !isSafetySupportCategory(category);

  const sendChatFirstTicket = async () => {
    if (!canStartChat) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const hasRef = Boolean(supportContextId) || Boolean(supportContextLabel.trim());
      const contextType =
        hasRef && supportContextType
          ? supportContextType
          : contextTypeForCategory(category) ?? supportContextType ?? undefined;
      const preset = supportTicketPresetFromCategory(category);
      const subjectLine =
        subject.trim() || preset.subject || message.trim().slice(0, 120) || sn("chatDefaultSubject");
      const res = await api.post<{
        ticket?: { id?: string; ticket_number?: string };
        assistantUnavailable?: { code: string };
      }>("/api/me/support-tickets", {
        subject: subjectLine,
        message: message.trim(),
        category,
        priority: preset.priority ?? priority,
        support_context_type: contextType,
        support_context_id: contextType && shouldSendSupportContextId(contextType) ? supportContextId : null,
        support_context_label: supportContextLabel.trim() || null,
        handling_mode: "assistant",
      });
      if (res.error) {
        Alert.alert(sn("submitFailedTitle"), getApiErrorMessage(res.error, sn("submitFailedFallback")));
        return;
      }
      if (res.data?.assistantUnavailable) {
        Alert.alert(sn("submittedTitle"), sn("sentToTeam"));
      }
      const ticketId = res.data?.ticket?.id;
      const ticketNumber = res.data?.ticket?.ticket_number;
      if (ticketNumber) trackSupportTicketCreated(ticketNumber);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (ticketId) {
        router.replace(`/(app)/(tabs)/support-tickets/${ticketId}` as never);
      } else {
        Alert.alert(sn("submittedTitle"), sn("submittedBody"), [{ text: t("common.ok"), onPress: handleBack }]);
      }
    } catch (e) {
      Alert.alert(
        t("customer.mobile.screens.authLogin.errorTitle"),
        e instanceof Error ? e.message : sn("submitGenericError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const hasRef = Boolean(supportContextId) || Boolean(supportContextLabel.trim());
      const contextType =
        hasRef && supportContextType
          ? supportContextType
          : contextTypeForCategory(category) ?? supportContextType ?? undefined;
      const res = await api.post<{ ticket?: { ticket_number?: string } }>("/api/me/support-tickets", {
        subject: subject.trim(),
        message: message.trim(),
        category,
        priority,
        support_context_type: contextType,
        support_context_id: contextType && shouldSendSupportContextId(contextType) ? supportContextId : null,
        support_context_label: supportContextLabel.trim() || null,
      });
      if (res.error) {
        Alert.alert(sn("submitFailedTitle"), getApiErrorMessage(res.error, sn("submitFailedFallback")));
        return;
      }
      const ticketNumber = res.data?.ticket?.ticket_number;
      if (ticketNumber) trackSupportTicketCreated(ticketNumber);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(sn("submittedTitle"), sn("submittedBody"), [{ text: t("common.ok"), onPress: handleBack }]);
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
      <Stack.Screen
        options={{
          headerShown: true,
          title: sn("screenTitle"),
          headerLeft: () => <NewTicketBackButton />,
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {assistantEnabled && chatStep === "category" ? (
          <View style={styles.fieldGap}>
            {prefillLocked && supportContextLabel ? (
              <View style={styles.prefillCard}>
                <Text style={styles.prefillLabel}>{sn("referenceLabel")}</Text>
                <Text style={styles.prefillValue}>{supportContextLabel}</Text>
              </View>
            ) : null}
            <SupportTicketCategoryPicker
              value={category}
              onChange={(v) => {
                setCategory(v);
                const derived = supportTicketPresetFromCategory(v);
                if (derived.priority) setPriority(derived.priority);
                if (derived.subject && !subject.trim()) setSubject(derived.subject);
              }}
              audience="customer"
            />
            {isSafetySupportCategory(category) ? (
              <Text style={styles.safetyHint}>{sn("safetyUseForm")}</Text>
            ) : null}
            <View style={styles.chatActionsRow}>
              <TouchableOpacity
                onPress={() => setChatStep("form")}
                style={styles.chatSecondaryBtn}
                accessibilityRole="button"
              >
                <Text style={styles.chatSecondaryBtnText}>{sn("useFullForm")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setChatStep(isSafetySupportCategory(category) ? "form" : "chat")}
                disabled={!category.trim() || isSafetySupportCategory(category)}
                style={[
                  styles.submitBtn,
                  styles.chatPrimaryBtnFlex,
                  (!category.trim() || isSafetySupportCategory(category)) && styles.submitBtnDisabled,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.submitBtnText}>{sn("continueToChat")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : assistantEnabled && chatStep === "chat" ? (
          <View>
            <Text style={styles.chatDisclaimer}>{sn("chatAiDisclaimer")}</Text>
            <Text style={styles.label}>{sn("detailsLabel")}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder={sn("detailPlaceholder")}
              placeholderTextColor="#9CA3AF"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={5000}
            />
            <View style={styles.chatActionsRow}>
              <TouchableOpacity
                onPress={() => setChatStep("category")}
                style={styles.chatSecondaryBtn}
                accessibilityRole="button"
              >
                <Text style={styles.chatSecondaryBtnText}>{sn("chatBack")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void sendChatFirstTicket()}
                disabled={!canStartChat || submitting}
                style={[
                  styles.submitBtn,
                  styles.chatPrimaryBtnFlex,
                  (!canStartChat || submitting) && styles.submitBtnDisabled,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.submitBtnText}>{submitting ? sn("submitting") : sn("startChat")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
        <>
        <View style={styles.fieldGap}>
          {prefillLocked && supportContextLabel ? (
            <View style={styles.prefillCard}>
              <Text style={styles.prefillLabel}>{sn("referenceLabel")}</Text>
              <Text style={styles.prefillValue}>{supportContextLabel}</Text>
              <TouchableOpacity
                onPress={() => {
                  setPrefillLocked(false);
                  setSupportContextLabel("");
                  setSupportContextId(null);
                  setSupportContextType(null);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.prefillRemove}>{t("common.clear")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>{sn("referenceLabel")}</Text>
              <TextInput
                style={styles.input}
                placeholder={sn("referencePlaceholder")}
                placeholderTextColor="#9CA3AF"
                value={supportContextLabel}
                onChangeText={setSupportContextLabel}
                maxLength={160}
              />
            </>
          )}
          <SupportTicketCategoryPicker
            value={category}
            onChange={(v) => {
              setCategory(v);
              const derived = supportTicketPresetFromCategory(v);
              if (derived.priority) setPriority(derived.priority);
              if (derived.subject && !subject.trim()) setSubject(derived.subject);
            }}
            audience="customer"
          />
        </View>

        <Text style={styles.label}>{sn("priorityLabel")}</Text>
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
                {sn(PRIORITY_LABEL_KEYS[p.value])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{sn("subjectLabel")}</Text>
        <TextInput
          style={styles.input}
          placeholder={sn("subjectPlaceholder")}
          placeholderTextColor="#9CA3AF"
          value={subject}
          onChangeText={setSubject}
          maxLength={160}
          returnKeyType="next"
        />

        <Text style={styles.label}>{sn("detailsLabel")}</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder={sn("detailPlaceholder")}
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
          <Text style={styles.submitBtnText}>{submitting ? sn("submitting") : sn("submitTicket")}</Text>
        </TouchableOpacity>
        {assistantEnabled ? (
          <TouchableOpacity
            onPress={() => setChatStep("category")}
            style={styles.chatLinkBtn}
            accessibilityRole="button"
          >
            <Text style={styles.chatLinkText}>{sn("continueToChat")}</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.hint}>{sn("responseHint")}</Text>
        </>
        )}
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
  prefillCard: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
  },
  prefillLabel: { fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 4 },
  prefillValue: { fontSize: 15, fontWeight: "600", color: Colors.gray[900] },
  prefillRemove: { marginTop: 8, fontSize: 14, fontWeight: "600", color: Colors.primary },
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
  chatDisclaimer: { marginBottom: 12, fontSize: 12, color: Colors.gray[600], lineHeight: 18 },
  safetyHint: { marginTop: 8, fontSize: 12, color: "#B45309", lineHeight: 18 },
  chatActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  chatSecondaryBtn: {
    flex: 1,
    minWidth: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingVertical: 14,
    alignItems: "center",
  },
  chatSecondaryBtnText: { fontWeight: "600", color: Colors.gray[700], fontSize: 15 },
  chatPrimaryBtnFlex: { flex: 1, minWidth: 120 },
  chatLinkBtn: { marginTop: 10, alignItems: "center", paddingVertical: 8 },
  chatLinkText: { fontSize: 14, fontWeight: "600", color: Colors.primary },
});
