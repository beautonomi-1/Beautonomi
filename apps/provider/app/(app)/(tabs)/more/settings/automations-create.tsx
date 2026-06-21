/**
 * Native Create automation — POST /api/provider/automations with full payload
 * (trigger_config, action_config message_template) aligned with web automations.
 */
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import type { Router } from "expo-router";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { pushInAppBrowser } from "@/lib/in-app-web";

const TRIGGER_TYPES = [
  { label: "Booking completed", value: "booking_completed" },
  { label: "Appointment reminder", value: "appointment_reminder" },
  { label: "No-show", value: "appointment_no_show" },
  { label: "Birthday", value: "client_birthday" },
  { label: "Client inactive (win-back)", value: "client_inactive" },
  { label: "Visit milestone", value: "visit_milestone" },
  { label: "Referral received", value: "referral_received" },
  { label: "Seasonal promotion", value: "seasonal_promotion" },
] as const;

const REMINDER_HOURS = [
  { label: "1h", value: 1 },
  { label: "24h", value: 24 },
  { label: "48h", value: 48 },
] as const;

const ACTION_TYPES = [
  { label: "Email", value: "email" },
  { label: "SMS", value: "sms" },
  { label: "Push notification", value: "notification" },
  { label: "WhatsApp", value: "whatsapp" },
] as const;

function alertCreateError(message: string, errorCode: string | null, router: Router) {
  if (errorCode === "SUBSCRIPTION_REQUIRED" || errorCode === "LIMIT_REACHED") {
    const base = getWebProviderBaseUrl().replace(/\/$/, "");
    Alert.alert(errorCode === "LIMIT_REACHED" ? "Automation limit" : "Subscription required", message, [
      { text: "OK", style: "cancel" },
      {
        text: "View plans & billing",
        onPress: () => pushInAppBrowser(router, `${base}/provider/subscription`, "Subscription"),
      },
    ]);
    return;
  }
  Alert.alert("Error", message);
}

export default function AutomationsCreateScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<string>("booking_completed");
  const [reminderHours, setReminderHours] = useState<number>(24);
  const [actionType, setActionType] = useState<"email" | "sms" | "notification" | "whatsapp">("sms");
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [messageTemplate, setMessageTemplate] = useState(
    "Hi {{name}}, thanks for booking with us. See you soon!",
  );
  const [emailSubject, setEmailSubject] = useState("");

  const { execute: create, loading } = useApiMutation("post");

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Enter a name for the automation.");
      return;
    }
    if (!messageTemplate.trim()) {
      Alert.alert("Required", "Enter a message template.");
      return;
    }
    if (actionType === "email" && !emailSubject.trim()) {
      Alert.alert("Required", "Enter an email subject.");
      return;
    }
    const delay = parseInt(delayMinutes, 10);
    if (isNaN(delay) || delay < 0) {
      Alert.alert("Invalid", "Delay must be 0 or more minutes.");
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
      alertCreateError(error, errorCode, router);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const isEmail = actionType === "email";

  return (
    <ScreenContainer scrollable={false} keyboardAvoiding={false}>
      <ScreenHeader
        title="Create automation"
        subtitle="Trigger, channel, and message template"
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              SMS and other channels are included with your platform subscription; volume follows your plan limits.
            </Text>
          </View>

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Thank you after booking"
              placeholderTextColor="#9ca3af"
              style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Description (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Short internal description"
              placeholderTextColor="#9ca3af"
              style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>When (trigger)</Text>
            <View style={twStyle("flex-row flex-wrap gap-2")}>
              {TRIGGER_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => setTriggerType(t.value)}
                  style={
                    triggerType === t.value
                      ? twStyle("rounded-xl bg-gray-900 px-4 py-2.5")
                      : twStyle("rounded-xl border border-gray-200 bg-white px-4 py-2.5")
                  }
                >
                  <Text
                    style={
                      triggerType === t.value
                        ? twStyle("font-medium text-white")
                        : twStyle("text-gray-700")
                    }
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {triggerType === "appointment_reminder" ? (
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Remind before appointment</Text>
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
                      {h.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Then (channel)</Text>
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
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {isEmail ? (
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Email subject</Text>
              <TextInput
                value={emailSubject}
                onChangeText={setEmailSubject}
                placeholder="Subject line"
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
          ) : null}

          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Message template</Text>
            <TextInput
              value={messageTemplate}
              onChangeText={setMessageTemplate}
              placeholder="{{name}}, {{appointment_date}}, …"
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              style={twStyle("min-h-[140px] rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900")}
            />
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              {"{{name}}"}, {"{{appointment_date}}"}, {"{{appointment_time}}"}, {"{{booking_number}}"}
            </Text>
          </View>

          <View style={twStyle("mb-6")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Delay (minutes)</Text>
            <TextInput
              value={delayMinutes}
              onChangeText={setDelayMinutes}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
            />
          </View>

          <ActionButton label={loading ? "Creating…" : "Create automation"} onPress={handleCreate} loading={loading} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
