/**
 * Native Create automation — POST /api/provider/automations with full payload
 * (trigger_config, action_config message_template) aligned with web automations.
 */
import { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import type { Router } from "expo-router";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";
import { isPlanGateErrorCode, showPlanGateAlert } from "@/lib/plan-gate";

const TRIGGER_TYPES = [
  { labelKey: "triggerBookingCompleted", value: "booking_completed" },
  { labelKey: "triggerAppointmentReminder", value: "appointment_reminder" },
  { labelKey: "triggerNoShow", value: "appointment_no_show" },
  { labelKey: "triggerBirthday", value: "client_birthday" },
  { labelKey: "triggerClientInactive", value: "client_inactive" },
  { labelKey: "triggerVisitMilestone", value: "visit_milestone" },
  { labelKey: "triggerReferralReceived", value: "referral_received" },
  { labelKey: "triggerSeasonal", value: "seasonal_promotion" },
] as const;

const REMINDER_HOURS = [
  { labelKey: "reminder1h", value: 1 },
  { labelKey: "reminder24h", value: 24 },
  { labelKey: "reminder48h", value: 48 },
] as const;

const ACTION_TYPES = [
  { labelKey: "actionEmail", value: "email" },
  { labelKey: "actionSms", value: "sms" },
  { labelKey: "actionPush", value: "notification" },
  { labelKey: "actionWhatsapp", value: "whatsapp" },
] as const;

function alertCreateError(message: string, errorCode: string | null, router: Router, errorTitle: string) {
  if (isPlanGateErrorCode(errorCode)) {
    showPlanGateAlert({ message, errorCode, router });
    return;
  }
  Alert.alert(errorTitle, message);
}

export default function AutomationsCreateScreen() {
  const { t } = useTranslation();
  const ac = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.automationsCreate.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<string>("booking_completed");
  const [reminderHours, setReminderHours] = useState<number>(24);
  const [actionType, setActionType] = useState<"email" | "sms" | "notification" | "whatsapp">("sms");
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [messageTemplate, setMessageTemplate] = useState(() =>
    t("provider.mobile.screens.automationsCreate.defaultMessage"),
  );
  const [emailSubject, setEmailSubject] = useState("");

  const { execute: create, loading } = useApiMutation("post");

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(ac("requiredTitle"), ac("nameRequired"));
      return;
    }
    if (!messageTemplate.trim()) {
      Alert.alert(ac("requiredTitle"), ac("messageRequired"));
      return;
    }
    if (actionType === "email" && !emailSubject.trim()) {
      Alert.alert(ac("requiredTitle"), ac("subjectRequired"));
      return;
    }
    const delay = parseInt(delayMinutes, 10);
    if (isNaN(delay) || delay < 0) {
      Alert.alert(ac("invalidTitle"), ac("invalidDelay"));
      return;
    }

    const trigger_config: Record<string, unknown> =
      triggerType === "appointment_reminder" ? { hours_before: reminderHours } : {};

    const action_config: Record<string, unknown> = {
      message_template: messageTemplate.trim(),
    };
    if (actionType === "email" && emailSubject.trim()) {
      action_config.subject = emailSubject.trim();
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error, errorCode } = await create("/api/provider/automations", {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      trigger_type: triggerType,
      trigger_config,
      action_type: actionType,
      action_config,
      delay_minutes: delay,
      is_active: true,
    });
    if (error) {
      alertCreateError(error, errorCode, router, ac("errorTitle"));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const isEmail = actionType === "email";

  return (
    <ScreenContainer scrollable={false} keyboardAvoiding={false}>
      <ScreenHeader
        title={ac("title")}
        subtitle={ac("subtitle")}
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={twStyle("mb-4 rounded-xl border border-pink-100 bg-pink-50/80 px-3 py-2.5")}>
            <Text style={twStyle("text-xs text-gray-700 leading-5")}>
              {ac("smsIncluded")}
            </Text>
          </View>

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ac("name")}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={ac("namePlaceholder")}
              placeholderTextColor="#9ca3af"
              style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ac("description")}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={ac("descriptionPlaceholder")}
              placeholderTextColor="#9ca3af"
              style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ac("whenTrigger")}</Text>
            <View style={twStyle("flex-row flex-wrap gap-2")}>
              {TRIGGER_TYPES.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => setTriggerType(item.value)}
                  style={
                    triggerType === item.value
                      ? twStyle("rounded-xl bg-gray-900 px-4 py-2.5")
                      : twStyle("rounded-xl border border-gray-200 bg-white px-4 py-2.5")
                  }
                >
                  <Text
                    style={
                      triggerType === item.value
                        ? twStyle("font-medium text-white")
                        : twStyle("text-gray-700")
                    }
                  >
                    {ac(item.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {triggerType === "appointment_reminder" ? (
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ac("remindBefore")}</Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {REMINDER_HOURS.map((h) => (
                  <TouchableOpacity
                    key={h.value}
                    onPress={() => setReminderHours(h.value)}
                    style={
                      reminderHours === h.value
                        ? twStyle("rounded-xl bg-indigo-600 px-4 py-2.5")
                        : twStyle("rounded-xl border border-gray-200 bg-white px-4 py-2.5")
                    }
                  >
                    <Text
                      style={
                        reminderHours === h.value
                          ? twStyle("font-medium text-white")
                          : twStyle("text-gray-700")
                      }
                    >
                      {ac(h.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ac("thenChannel")}</Text>
            <View style={twStyle("flex-row flex-wrap gap-2")}>
              {ACTION_TYPES.map((a) => (
                <TouchableOpacity
                  key={a.value}
                  onPress={() => setActionType(a.value)}
                  style={
                    actionType === a.value
                      ? twStyle("rounded-xl bg-indigo-600 px-4 py-2.5")
                      : twStyle("rounded-xl border border-gray-200 bg-white px-4 py-2.5")
                  }
                >
                  <Text
                    style={
                      actionType === a.value
                        ? twStyle("font-medium text-white")
                        : twStyle("text-gray-700")
                    }
                  >
                    {ac(a.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {isEmail ? (
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ac("emailSubject")}</Text>
              <TextInput
                value={emailSubject}
                onChangeText={setEmailSubject}
                placeholder={ac("subjectPlaceholder")}
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
          ) : null}

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ac("messageTemplate")}</Text>
            <TextInput
              value={messageTemplate}
              onChangeText={setMessageTemplate}
              placeholder={ac("templatePlaceholder")}
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              style={twStyle("min-h-[140px] rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900")}
            />
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              {ac("templateTokens")}
            </Text>
          </View>

          <View style={twStyle("mb-6")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ac("delayMinutes")}</Text>
            <TextInput
              value={delayMinutes}
              onChangeText={setDelayMinutes}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>

          <ActionButton label={loading ? ac("creating") : ac("create")} onPress={handleCreate} loading={loading} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
