/**
 * Edit automation message template — parity with web MessagePreviewDialog.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
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

function previewMessage(template: string): string {
  let previewText = template;
  previewText = previewText.replace(/\{\{name\}\}/g, "Sarah");
  previewText = previewText.replace(/\{\{customer_name\}\}/g, "Sarah");
  previewText = previewText.replace(/\{\{appointment_date\}\}/g, "March 15, 2024");
  previewText = previewText.replace(/\{\{appointment_time\}\}/g, "2:00 PM");
  previewText = previewText.replace(/\{\{booking_number\}\}/g, "BK-12345");
  previewText = previewText.replace(/\{\{package_expiry_date\}\}/g, "April 1, 2024");
  return previewText;
}

export function AutomationMessageEditor({
  visible,
  onClose,
  automation,
  onSaved,
}: AutomationMessageEditorProps) {
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
  const preview = previewMessage(messageTemplate);

  async function handleSave() {
    if (!messageTemplate.trim()) {
      Alert.alert("Required", "Enter a message template.");
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
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={twStyle("flex-1 justify-end bg-black/40")}
      >
        <View
          style={[
            twStyle("rounded-t-3xl bg-white"),
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={twStyle("flex-row items-center justify-between border-b border-gray-100 px-4 py-3")}>
            <Text style={twStyle("flex-1 pr-2 text-lg font-semibold text-gray-900")} numberOfLines={2}>
              Message: {automation.name}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
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
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Email subject</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Subject line"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900")}
                />
              </View>
            )}

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Message template</Text>
              <TextInput
                value={messageTemplate}
                onChangeText={setMessageTemplate}
                placeholder="{{name}}, {{appointment_date}}, …"
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                style={twStyle("min-h-[140px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm text-gray-900")}
              />
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                Variables: {"{{name}}"}, {"{{appointment_date}}"}, {"{{appointment_time}}"}, {"{{booking_number}}"},{" "}
                {"{{package_expiry_date}}"}
              </Text>
            </View>

            <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3")}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Preview</Text>
              {isEmail && !!subject.trim() && (
                <Text style={twStyle("mb-1 text-sm font-semibold text-gray-900")}>{subject}</Text>
              )}
              <Text style={twStyle("text-sm text-gray-800")}>{preview || "…"}</Text>
            </View>

            <View style={twStyle("flex-row gap-3")}>
              <TouchableOpacity
                onPress={onClose}
                style={twStyle("flex-1 items-center rounded-xl border border-gray-200 py-3")}
              >
                <Text style={twStyle("font-semibold text-gray-700")}>Cancel</Text>
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
                  <Text style={twStyle("font-semibold text-white")}>Save template</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
