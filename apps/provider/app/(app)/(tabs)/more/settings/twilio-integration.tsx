import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface TwilioIntegration {
  id?: string;
  account_sid: string;
  auth_token: string;
  sms_from_number: string | null;
  whatsapp_from_number: string | null;
  is_sms_enabled: boolean;
  is_whatsapp_enabled: boolean;
  connected_date: string | null;
  last_tested_at: string | null;
  sms_test_status: string | null;
  whatsapp_test_status: string | null;
}

interface BalanceInfo {
  balance: number | null;
  currency: string | null;
  estimatedMessagesRemaining?: number;
  hasIntegration: boolean;
  error?: string;
}

interface MessageStats {
  sms_sent_today: number;
  sms_sent_month: number;
  whatsapp_sent_today: number;
  whatsapp_sent_month: number;
  delivery_rate: number;
}

interface NotificationTemplate {
  id: string;
  name: string;
  type: "booking_confirmation" | "booking_reminder" | "cancellation" | "follow_up" | "custom";
  channel: "sms" | "whatsapp" | "both";
  enabled: boolean;
  template: string;
}

interface Form {
  accountSid: string;
  authToken: string;
  smsFrom: string;
  whatsappFrom: string;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
}

const EMPTY_FORM: Form = {
  accountSid: "",
  authToken: "",
  smsFrom: "",
  whatsappFrom: "",
  smsEnabled: false,
  whatsappEnabled: false,
};

function templateTypeLabel(type: string) {
  switch (type) {
    case "booking_confirmation": return "Booking Confirmation";
    case "booking_reminder": return "Booking Reminder";
    case "cancellation": return "Cancellation";
    case "follow_up": return "Follow Up";
    case "custom": return "Custom";
    default: return type;
  }
}

function templateTypeIcon(type: string): { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  switch (type) {
    case "booking_confirmation": return { icon: "checkmark-circle-outline", color: "#22c55e", bg: "bg-green-50" };
    case "booking_reminder": return { icon: "alarm-outline", color: "#f59e0b", bg: "bg-amber-50" };
    case "cancellation": return { icon: "close-circle-outline", color: "#ef4444", bg: "bg-red-50" };
    case "follow_up": return { icon: "chatbubble-outline", color: "#6366f1", bg: "bg-indigo-50" };
    default: return { icon: "document-text-outline", color: "#6b7280", bg: "bg-gray-50" };
  }
}

export default function TwilioIntegrationScreen() {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);
  const [testingChannel, setTestingChannel] = useState<"sms" | "whatsapp" | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [templateText, setTemplateText] = useState("");

  const { data: integration, loading, refresh } = useApi<TwilioIntegration>("/api/provider/twilio-integration");
  const { data: balanceInfo } = useApi<BalanceInfo>("/api/provider/twilio-integration/balance");
  const { data: messageStats } = useApi<MessageStats>("/api/provider/twilio-integration/stats");
  const { data: templates, refresh: refreshTemplates } = useApi<NotificationTemplate[]>("/api/provider/twilio-integration/templates");
  const { execute: saveConfig, loading: saving } = useApiMutation<any>("put");
  const { execute: sendTest } = useApiPost<any, any>("/api/provider/twilio-integration/test");
  const { execute: toggleTemplate } = useApiMutation<any>("patch");
  const { execute: updateTemplate, loading: savingTemplate } = useApiMutation<any>("patch");

  useEffect(() => {
    if (integration) {
      setForm({
        accountSid: integration.account_sid || "",
        authToken: integration.auth_token || "",
        smsFrom: integration.sms_from_number || "",
        whatsappFrom: (integration.whatsapp_from_number || "").replace("whatsapp:", ""),
        smsEnabled: integration.is_sms_enabled,
        whatsappEnabled: integration.is_whatsapp_enabled,
      });
    }
  }, [integration]);

  const update = useCallback(
    (k: keyof Form, v: any) => {
      setForm((p) => ({ ...p, [k]: v }));
      setDirty(true);
    },
    []
  );

  async function handleSave() {
    if (!form.accountSid || (form.accountSid === "••••••••" ? !integration?.account_sid : false)) {
      Alert.alert("Required", "Account SID is required");
      return;
    }
    const payload = {
      account_sid: form.accountSid,
      auth_token: form.authToken,
      sms_from_number: form.smsFrom || undefined,
      whatsapp_from_number: form.whatsappFrom || undefined,
      is_sms_enabled: form.smsEnabled,
      is_whatsapp_enabled: form.whatsappEnabled,
    };
    const { error } = await saveConfig("/api/provider/twilio-integration", payload);
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  async function handleTest(channel: "sms" | "whatsapp") {
    if (!testPhone.trim()) {
      Alert.alert("Required", "Enter a phone number to test");
      return;
    }
    setTestingChannel(channel);
    const { error } = await sendTest({ test_phone: testPhone.trim(), channel });
    setTestingChannel(null);
    if (error) {
      Alert.alert("Test Failed", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Success", `Test ${channel.toUpperCase()} sent!`);
    refresh();
  }

  async function handleToggleTemplate(template: NotificationTemplate) {
    const { error } = await toggleTemplate(
      `/api/provider/twilio-integration/templates/${template.id}`,
      { enabled: !template.enabled }
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    refreshTemplates();
  }

  async function handleSaveTemplate() {
    if (!selectedTemplate || !templateText.trim()) return;
    const { error } = await updateTemplate(
      `/api/provider/twilio-integration/templates/${selectedTemplate.id}`,
      { template: templateText.trim() }
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedTemplate(null);
    refreshTemplates();
  }

  if (loading)
    return (
      <ScreenContainer>
        <ScreenHeader title="SMS & WhatsApp" showBack />
        <LoadingState message="Loading integration..." />
      </ScreenContainer>
    );

  return (
    <ScreenContainer>
      <ScreenHeader title="SMS & WhatsApp" showBack subtitle="Twilio Integration" />

      {/* Connection status */}
      {integration?.connected_date && (
        <View style={twStyle("mb-4 flex-row items-center rounded-lg bg-green-50 px-3 py-2")}>
          <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          <Text style={twStyle("ml-2 text-xs text-green-700")}>
            Connected since {new Date(integration.connected_date).toLocaleDateString()}
          </Text>
        </View>
      )}

      {/* Balance card */}
      {balanceInfo?.hasIntegration && balanceInfo.balance != null && (
        <View style={twStyle("mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View>
              <Text style={twStyle("text-xs text-blue-600")}>Account Balance</Text>
              <Text style={twStyle("text-xl font-bold text-blue-700")}>
                ${balanceInfo.balance.toFixed(2)} {balanceInfo.currency}
              </Text>
            </View>
            {balanceInfo.estimatedMessagesRemaining != null && (
              <View style={twStyle("items-end")}>
                <Text style={twStyle("text-xs text-blue-600")}>Est. messages</Text>
                <Text style={twStyle("text-lg font-bold text-blue-700")}>
                  ~{balanceInfo.estimatedMessagesRemaining.toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Message stats */}
      {messageStats && integration?.id && (
        <>
          <SectionHeader title="Message Stats" />
          <View style={twStyle("mb-4 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
              <StatCard
                title="SMS Today"
                value={String(messageStats.sms_sent_today)}
                icon="chatbubble-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
              <StatCard
                title="WA Today"
                value={String(messageStats.whatsapp_sent_today)}
                icon="logo-whatsapp"
                iconColor="#22c55e"
                iconBg="bg-green-50"
                compact
              />
            </View>
            <View style={twStyle("flex-1")}>
              <StatCard
                title="Delivery"
                value={`${messageStats.delivery_rate}%`}
                icon="checkmark-done-outline"
                iconColor="#3b82f6"
                iconBg="bg-blue-50"
                compact
              />
            </View>
          </View>
          <View style={twStyle("mb-4 flex-row rounded-xl bg-gray-50 p-3")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <Text style={twStyle("text-[10px] text-gray-500")}>SMS this month</Text>
              <Text style={twStyle("text-sm font-bold text-gray-900")}>{messageStats.sms_sent_month}</Text>
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-[10px] text-gray-500")}>WA this month</Text>
              <Text style={twStyle("text-sm font-bold text-gray-900")}>{messageStats.whatsapp_sent_month}</Text>
            </View>
          </View>
        </>
      )}

      {/* Credentials */}
      <SectionHeader title="Credentials" />
      <View style={twStyle("mb-5")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Account SID</Text>
        <TextInput
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={form.accountSid}
          onChangeText={(t) => update("accountSid", t)}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Auth Token</Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={form.authToken}
          onChangeText={(t) => update("authToken", t)}
          placeholder="Auth token"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      {/* SMS */}
      <SectionHeader title="SMS" />
      <View style={twStyle("mb-5")}>
        <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>Enable SMS</Text>
          <Switch
            value={form.smsEnabled}
            onValueChange={(v) => update("smsEnabled", v)}
            trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
            thumbColor="#fff"
          />
        </View>
        {form.smsEnabled && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>SMS From Number</Text>
            <TextInput
              style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={form.smsFrom}
              onChangeText={(t) => update("smsFrom", t)}
              placeholder="+27..."
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </>
        )}
      </View>

      {/* WhatsApp */}
      <SectionHeader title="WhatsApp" />
      <View style={twStyle("mb-5")}>
        <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>Enable WhatsApp</Text>
          <Switch
            value={form.whatsappEnabled}
            onValueChange={(v) => update("whatsappEnabled", v)}
            trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
            thumbColor="#fff"
          />
        </View>
        {form.whatsappEnabled && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              WhatsApp From Number
            </Text>
            <TextInput
              style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={form.whatsappFrom}
              onChangeText={(t) => update("whatsappFrom", t)}
              placeholder="+27..."
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </>
        )}
      </View>

      <ActionButton
        label="Save Configuration"
        onPress={handleSave}
        loading={saving}
        disabled={!dirty}
        fullWidth
      />

      {/* Notification Templates */}
      {integration?.id && templates && templates.length > 0 && (
        <>
          <SectionHeader title="Notification Templates" />
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white")}>
            {templates.map((tmpl, idx) => {
              const ti = templateTypeIcon(tmpl.type);
              return (
                <View
                  key={tmpl.id}
                  style={twStyle(`flex-row items-center px-4 py-3 ${
                    idx < templates.length - 1 ? "border-b border-gray-50" : ""
                  }`)}
                >
                  <View style={twStyle(`h-9 w-9 items-center justify-center rounded-lg ${ti.bg}`)}>
                    <Ionicons name={ti.icon} size={16} color={ti.color} />
                  </View>
                  <TouchableOpacity
                    style={twStyle("ml-3 flex-1")}
                    onPress={() => {
                      setSelectedTemplate(tmpl);
                      setTemplateText(tmpl.template);
                    }}
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {tmpl.name || templateTypeLabel(tmpl.type)}
                    </Text>
                    <Text style={twStyle("text-[11px] text-gray-400 capitalize")}>
                      {tmpl.channel} • {templateTypeLabel(tmpl.type)}
                    </Text>
                  </TouchableOpacity>
                  <Switch
                    value={tmpl.enabled}
                    onValueChange={() => handleToggleTemplate(tmpl)}
                    trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
                    thumbColor="#fff"
                  />
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Test section */}
      {integration?.id && (
        <View style={twStyle("mt-2")}>
          <SectionHeader title="Test Integration" />
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={testPhone}
            onChangeText={setTestPhone}
            placeholder="Phone number (+27...)"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />
          <View style={twStyle("flex-row")}>
            {form.smsEnabled && (
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3"), { marginRight: 12 }]}
                onPress={() => handleTest("sms")}
                disabled={!!testingChannel}
              >
                {testingChannel === "sms" ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  <Ionicons name="chatbubble-outline" size={16} color="#6366f1" />
                )}
                <Text style={twStyle("ml-2 text-sm font-medium text-indigo-700")}>
                  Send Test SMS
                </Text>
              </TouchableOpacity>
            )}
            {form.whatsappEnabled && (
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-green-50 py-3")}
                onPress={() => handleTest("whatsapp")}
                disabled={!!testingChannel}
              >
                {testingChannel === "whatsapp" ? (
                  <ActivityIndicator size="small" color="#22c55e" />
                ) : (
                  <Ionicons name="logo-whatsapp" size={16} color="#22c55e" />
                )}
                <Text style={twStyle("ml-2 text-sm font-medium text-green-700")}>
                  Send Test WhatsApp
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={twStyle("h-24")} />

      {/* Template editor */}
      <BottomSheet
        visible={!!selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        title="Edit Template"
      >
        {selectedTemplate && (
          <View>
            <View style={twStyle("mb-3 flex-row items-center")}>
              <View style={twStyle(`h-9 w-9 items-center justify-center rounded-lg ${templateTypeIcon(selectedTemplate.type).bg}`)}>
                <Ionicons
                  name={templateTypeIcon(selectedTemplate.type).icon}
                  size={16}
                  color={templateTypeIcon(selectedTemplate.type).color}
                />
              </View>
              <View style={twStyle("ml-3")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {selectedTemplate.name || templateTypeLabel(selectedTemplate.type)}
                </Text>
                <Text style={twStyle("text-xs text-gray-400 capitalize")}>
                  {selectedTemplate.channel}
                </Text>
              </View>
            </View>

            <Text style={twStyle("mb-1 text-xs text-gray-500")}>
              Available variables: {"{client_name}"}, {"{service_name}"}, {"{date}"},{" "}
              {"{time}"}, {"{provider_name}"}
            </Text>

            <TextInput
              style={twStyle("mb-4 min-h-[120px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={templateText}
              onChangeText={setTemplateText}
              placeholder="Message template..."
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />

            <ActionButton
              label="Save Template"
              onPress={handleSaveTemplate}
              loading={savingTemplate}
              fullWidth
              disabled={!templateText.trim()}
            />
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
