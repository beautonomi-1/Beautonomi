/**
 * Edit automation message template — parity with web MessagePreviewDialog.
 */
import React, { useEffect, useState } from "react";
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Alert } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApiMutation } from "@/hooks/useApi";
import { twStyle } from "@/lib/twStyle";

export interface AutomationMessageEditorProps {
  visible: boolean;
  onClose: () => void;
  automation: {
    id: string;
    name: string;
    triggerLabel: string;
    action_type?: string;
    message_template?: string;
    subject?: string;
  };
  onSaved: () => void;
}

function previewMessage(template: string, samples: { name: string; date: string; time: string; booking: string; expiry: string }): string {
  let previewText = template;
  previewText = previewText.replace(/\{\{name\}\}/g, samples.name);
  previewText = previewText.replace(/\{\{customer_name\}\}/g, samples.name);
  previewText = previewText.replace(/\{\{appointment_date\}\}/g, samples.date);
  previewText = previewText.replace(/\{\{appointment_time\}\}/g, samples.time);
  previewText = previewText.replace(/\{\{booking_number\}\}/g, samples.booking);
  previewText = previewText.replace(/\{\{package_expiry_date\}\}/g, samples.expiry);
  return previewText;
}

export function AutomationMessageEditor({
  visible,
  onClose,
  automation,
  onSaved,
}: AutomationMessageEditorProps) {
  const { t } = useTranslation();
  const am = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.components.automationMessageEditor.${key}`, opts) as string;
  const insets = useSafeAreaInsets();
  const [messageTemplate, setMessageTemplate] = useState(automation.message_template || "");
  const [subject, setSubject] = useState(automation.subject || "");
  const { execute: patchAutomation, loading } = useApiMutation("patch");

  useEffect(() => {
    if (visible) {
      setMessageTemplate(automation.message_template || "");
      setSubject(automation.subject || "");
    }
  }, [visible, automation.id, automation.message_template, automation.subject]);

  const actionType = automation.action_type || "sms";
  const isEmail = actionType === "email";
  const preview = previewMessage(messageTemplate, {
    name: am("previewName"),
    date: am("previewDate"),
    time: am("previewTime"),
    booking: am("previewBooking"),
    expiry: am("previewExpiry"),
  });

  async function handleSave() {
    if (!messageTemplate.trim()) {
      Alert.alert(am("requiredTitle"), am("enterTemplate"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await patchAutomation(`/api/provider/automations/${automation.id}`, {
      action_config: {
        message_template: messageTemplate,
        ...(isEmail && subject.trim() ? { subject: subject.trim() } : {}),
      },
    });
    if (error) {
      Alert.alert(am("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior="padding"
        style={twStyle("flex-1 justify-end bg-black/40")}
      >
        <View
          style={[
            twStyle("rounded-t-3xl bg-white"),
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={twStyle("flex-row items-center justify-between border-b border-gray-100 px-4 py-3")}>
            <Text style={twStyle("flex-1 pe-2 text-lg font-semibold text-gray-900")} numberOfLines={2}>
              {am("messageTitle", { name: automation.name })}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel={am("closeA11y")}>
              <Ionicons name="close" size={26} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: Platform.OS === "ios" ? 520 : 480 }}
            contentContainerStyle={twStyle("px-4 pb-4")}
          >
            <View style={twStyle("mb-3 flex-row items-center gap-2")}>
              <Ionicons name={isEmail ? "mail-outline" : "phone-portrait-outline"} size={18} color="#6b7280" />
              <View style={twStyle("rounded-full bg-gray-100 px-2 py-1")}>
                <Text style={twStyle("text-xs text-gray-700")}>{automation.triggerLabel}</Text>
              </View>
            </View>

            {isEmail && (
              <View style={twStyle("mb-3")}>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{am("emailSubject")}</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder={am("subjectPlaceholder")}
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900")}
                />
              </View>
            )}

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{am("messageTemplate")}</Text>
              <TextInput
                value={messageTemplate}
                onChangeText={setMessageTemplate}
                placeholder={am("templatePlaceholder", { example: "{{name}}, {{appointment_date}}, …" })}
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                style={twStyle("min-h-[140px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm text-gray-900")}
              />
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {am("variables", { tokens: "{{name}}, {{appointment_date}}, {{appointment_time}}, {{booking_number}}, {{package_expiry_date}}" })}
              </Text>
            </View>

            <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3")}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>{am("preview")}</Text>
              {isEmail && !!subject.trim() && (
                <Text style={twStyle("mb-1 text-sm font-semibold text-gray-900")}>{subject}</Text>
              )}
              <Text style={twStyle("text-sm text-gray-800")}>{preview || am("previewEmpty")}</Text>
            </View>

            <View style={twStyle("flex-row gap-3")}>
              <TouchableOpacity
                onPress={onClose}
                style={twStyle("flex-1 items-center rounded-xl border border-gray-200 py-3")}
              >
                <Text style={twStyle("font-semibold text-gray-700")}>{am("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={loading || !messageTemplate.trim()}
                style={twStyle(
                  loading || !messageTemplate.trim()
                    ? "flex-1 flex-row items-center justify-center rounded-xl bg-pink-200 py-3"
                    : "flex-1 flex-row items-center justify-center rounded-xl bg-[#FF0077] py-3",
                )}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={twStyle("font-semibold text-white")}>{am("saveTemplate")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
