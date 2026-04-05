/**
 * Native Create automation – full in-app form.
 * POST /api/provider/automations
 */
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";

const TRIGGER_TYPES = [
  { label: "Booking completed", value: "booking_completed" },
  { label: "Appointment reminder", value: "appointment_reminder" },
  { label: "No-show", value: "appointment_no_show" },
  { label: "Birthday", value: "client_birthday" },
  { label: "Client inactive (win-back)", value: "client_inactive" },
  { label: "Visit milestone", value: "visit_milestone" },
  { label: "Referral received", value: "referral_received" },
  { label: "Seasonal promotion", value: "seasonal_promotion" },
];

const ACTION_TYPES = [
  { label: "Email", value: "email" },
  { label: "SMS", value: "sms" },
  { label: "Push notification", value: "notification" },
  { label: "WhatsApp", value: "whatsapp" },
] as const;

export default function AutomationsCreateScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("booking_completed");
  const [actionType, setActionType] = useState<"email" | "sms" | "notification" | "whatsapp">("email");
  const [delayMinutes, setDelayMinutes] = useState("0");

  const { execute: create, loading } = useApiMutation("post");

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Enter a name for the automation.");
      return;
    }
    const delay = parseInt(delayMinutes, 10);
    if (isNaN(delay) || delay < 0) {
      Alert.alert("Invalid", "Delay must be 0 or more minutes.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await create("/api/provider/automations", {
      name: name.trim(),
      trigger_type: triggerType,
      action_type: actionType,
      delay_minutes: delay,
      is_active: true,
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Create automation"
        subtitle="Follow-ups & marketing"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Thank you after booking"
            placeholderTextColor="#9ca3af"
            style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
          />
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>When (trigger)</Text>
          <View style={twStyle("flex-row flex-wrap gap-2")}>
            {TRIGGER_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                onPress={() => setTriggerType(t.value)}
                style={[
                  twStyle("rounded-xl py-2.5 px-4"),
                  triggerType === t.value ? twStyle("bg-gray-900") : twStyle("border border-gray-200 bg-white"),
                ]}
              >
                <Text style={triggerType === t.value ? twStyle("text-white font-medium") : twStyle("text-gray-700")}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Then (action)</Text>
          <View style={twStyle("flex-row flex-wrap gap-2")}>
            {ACTION_TYPES.map((a) => (
              <TouchableOpacity
                key={a.value}
                onPress={() => setActionType(a.value)}
                style={[
                  twStyle("rounded-xl py-2.5 px-4"),
                  actionType === a.value ? twStyle("bg-indigo-600") : twStyle("border border-gray-200 bg-white"),
                ]}
              >
                <Text style={actionType === a.value ? twStyle("text-white font-medium") : twStyle("text-gray-700")}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={twStyle("mb-6")}>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Delay (minutes)</Text>
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
    </ScreenContainer>
  );
}
