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
import { useRouter } from "expo-router";
import { showPlanGateAlert } from "@/lib/plan-gate";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { useTranslation } from "@beautonomi/i18n";

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

function templateTypeLabel(type: string, ti: (key: string) => string) {
  switch (type) {
    case "booking_confirmation": return ti("typeBookingConfirmation");
    case "booking_reminder": return ti("typeBookingReminder");
    case "cancellation": return ti("typeCancellation");
    case "follow_up": return ti("typeFollowUp");
    case "custom": return ti("typeCustom");
    default: return type;
  }
}

function templateChannelLabel(channel: string, ti: (key: string) => string) {
  switch (channel) {
    case "sms": return ti("channelSms");
    case "whatsapp": return ti("channelWhatsapp");
    case "both": return ti("channelBoth");
    default: return channel;
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

function formatDateSafe(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString();
}

export default function TwilioIntegrationScreen() {
  const { t } = useTranslation();
  const ti = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.twilioIntegration.${key}`, opts) as string;
  const router = useRouter();
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
      Alert.alert(ti("requiredTitle"), ti("accountSidRequired"));
      return;
    }
    const smsErr = form.smsFrom.trim() ? validateE164Phone(form.smsFrom.trim()) : null;
    if (smsErr) {
      Alert.alert(ti("smsNumberTitle"), smsErr);
      return;
    }
    const waErr = form.whatsappFrom.trim() ? validateE164Phone(form.whatsappFrom.trim()) : null;
    if (waErr) {
      Alert.alert(ti("whatsappNumberTitle"), waErr);
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
    const { error, errorCode } = await saveConfig("/api/provider/twilio-integration", payload);
    if (error) {
      showPlanGateAlert({ title: ti("couldNotSave"), message: error, errorCode, router });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  async function handleTest(channel: "sms" | "whatsapp") {
    const tp = testPhone.trim();
    if (!tp) {
      Alert.alert(ti("requiredTitle"), ti("enterTestPhone"));
      return;
    }
    const testErr = validateE164Phone(tp);
    if (testErr) {
      Alert.alert(ti("invalidNumber"), testErr);
      return;
    }
    setTestingChannel(channel);
    const { error } = await sendTest({ test_phone: tp, channel });
    setTestingChannel(null);
    if (error) {
      Alert.alert(ti("testFailed"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(ti("successTitle"), ti("testSent", { channel: channel.toUpperCase() }));
    refresh();
  }

  async function handleToggleTemplate(template: NotificationTemplate) {
    const { error } = await toggleTemplate(
      `/api/provider/twilio-integration/templates/${template.id}`,
      { enabled: !template.enabled }
    );
    if (error) {
      Alert.alert(ti("errorTitle"), error);
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
      Alert.alert(ti("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedTemplate(null);
    refreshTemplates();
  }

  if (loading)
    return (
      <ScreenContainer>
        <ScreenHeader title={ti("title")} showBack />
        <LoadingState message={ti("loading")} />
      </ScreenContainer>
    );

  return (
    <ScreenContainer>
      <ScreenHeader title={ti("title")} showBack subtitle={ti("subtitle")} />

      {/* Connection status */}
      {integration?.connected_date && (
        <View style={twStyle("mb-4 flex-row items-center rounded-lg bg-green-50 px-3 py-2")}>
          <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          <Text style={twStyle("ms-2 text-xs text-green-700")}>
            {ti("connectedSince", { date: formatDateSafe(integration.connected_date, ti("dateUnavailable")) })}
          </Text>
        </View>
      )}

      {/* Balance card */}
      {balanceInfo?.hasIntegration && balanceInfo.balance != null && (
        <View style={twStyle("mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View>
              <Text style={twStyle("text-xs text-blue-600")}>{ti("accountBalance")}</Text>
              <Text style={twStyle("text-xl font-bold text-blue-700")}>
                {ti("balanceValue", { amount: balanceInfo.balance.toFixed(2), currency: balanceInfo.currency })}
              </Text>
            </View>
            {balanceInfo.estimatedMessagesRemaining != null && (
              <View style={twStyle("items-end")}>
                <Text style={twStyle("text-xs text-blue-600")}>{ti("estMessages")}</Text>
                <Text style={twStyle("text-lg font-bold text-blue-700")}>
                  {ti("estMessagesValue", { count: balanceInfo.estimatedMessagesRemaining.toLocaleString() })}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Message stats */}
      {messageStats && integration?.id && (
        <>
          <SectionHeader title={ti("messageStats")} />
          <View style={twStyle("mb-4 flex-row")}>
            <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
              <StatCard
                title={ti("smsToday")}
                value={String(messageStats.sms_sent_today)}
                icon="chatbubble-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
              <StatCard
                title={ti("waToday")}
                value={String(messageStats.whatsapp_sent_today)}
                icon="logo-whatsapp"
                iconColor="#22c55e"
                iconBg="bg-green-50"
                compact
              />
            </View>
            <View style={twStyle("flex-1")}>
              <StatCard
                title={ti("delivery")}
                value={ti("deliveryRate", { rate: messageStats.delivery_rate })}
                icon="checkmark-done-outline"
                iconColor="#3b82f6"
                iconBg="bg-blue-50"
                compact
              />
            </View>
          </View>
          <View style={twStyle("mb-4 flex-row rounded-xl bg-gray-50 p-3")}>
            <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
              <Text style={twStyle("text-[10px] text-gray-500")}>{ti("smsThisMonth")}</Text>
              <Text style={twStyle("text-sm font-bold text-gray-900")}>{messageStats.sms_sent_month}</Text>
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-[10px] text-gray-500")}>{ti("waThisMonth")}</Text>
              <Text style={twStyle("text-sm font-bold text-gray-900")}>{messageStats.whatsapp_sent_month}</Text>
            </View>
          </View>
        </>
      )}

      {/* Credentials */}
      <SectionHeader title={ti("credentials")} />
      <View style={twStyle("mb-5")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ti("accountSid")}</Text>
        <TextInput
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={form.accountSid}
          onChangeText={(t) => update("accountSid", t)}
          placeholder={ti("accountSidPlaceholder")}
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ti("authToken")}</Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={form.authToken}
          onChangeText={(t) => update("authToken", t)}
          placeholder={ti("authTokenPlaceholder")}
          placeholderTextColor="#9ca3af"
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      {/* SMS */}
      <SectionHeader title={ti("sms")} />
      <View style={twStyle("mb-5")}>
        <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>{ti("enableSms")}</Text>
          <Switch
            value={form.smsEnabled}
            onValueChange={(v) => update("smsEnabled", v)}
            trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
            thumbColor="#fff"
          />
        </View>
        {form.smsEnabled && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ti("smsFromNumber")}</Text>
            <TextInput
              style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={form.smsFrom}
              onChangeText={(t) => update("smsFrom", t)}
              placeholder={ti("smsFromPlaceholder")}
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </>
        )}
      </View>

      {/* WhatsApp */}
      <SectionHeader title={ti("whatsapp")} />
      <View style={twStyle("mb-5")}>
        <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>{ti("enableWhatsapp")}</Text>
          <Switch
            value={form.whatsappEnabled}
            onValueChange={(v) => update("whatsappEnabled", v)}
            trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
            thumbColor="#fff"
          />
        </View>
        {form.whatsappEnabled && (
          <E164PhoneField
            label={ti("whatsappFromNumber")}
            valueE164={form.whatsappFrom}
            onChangeE164={(v) => update("whatsappFrom", v)}
            placeholderNational={ti("phoneNumberPlaceholder")}
            showHint
          />
        )}
      </View>

      <ActionButton
        label={ti("saveConfiguration")}
        onPress={handleSave}
        loading={saving}
        disabled={!dirty}
        fullWidth
      />

      {/* Notification Templates */}
      {integration?.id && templates && templates.length > 0 && (
        <>
          <SectionHeader title={ti("notificationTemplates")} />
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white")}>
            {templates.map((tmpl, idx) => {
              const typeIcon = templateTypeIcon(tmpl.type);
              return (
                <View
                  key={tmpl.id}
                  style={twStyle(`flex-row items-center px-4 py-3 ${
                    idx < templates.length - 1 ? "border-b border-gray-50" : ""
                  }`)}
                >
                  <View style={twStyle(`h-9 w-9 items-center justify-center rounded-lg ${typeIcon.bg}`)}>
                    <Ionicons name={typeIcon.icon} size={16} color={typeIcon.color} />
                  </View>
                  <TouchableOpacity
                    style={twStyle("ms-3 flex-1")}
                    onPress={() => {
                      setSelectedTemplate(tmpl);
                      setTemplateText(tmpl.template);
                    }}
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {tmpl.name || templateTypeLabel(tmpl.type, ti)}
                    </Text>
                    <Text style={twStyle("text-[11px] text-gray-400 capitalize")}>
                      {templateChannelLabel(tmpl.channel, ti)} • {templateTypeLabel(tmpl.type, ti)}
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
          <SectionHeader title={ti("testIntegration")} />
          <View style={twStyle("mb-3")}>
            <E164PhoneField
              label={ti("testDestination")}
              valueE164={testPhone}
              onChangeE164={setTestPhone}
              placeholderNational={ti("phoneNumberPlaceholder")}
              showHint
            />
          </View>
          <View style={twStyle("flex-row")}>
            {form.smsEnabled && (
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3"), { marginEnd: 12 }]}
                onPress={() => handleTest("sms")}
                disabled={!!testingChannel || !testPhone.trim() || !!validateE164Phone(testPhone.trim())}
              >
                {testingChannel === "sms" ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  <Ionicons name="chatbubble-outline" size={16} color="#6366f1" />
                )}
                <Text style={twStyle("ms-2 text-sm font-medium text-indigo-700")}>
                  {ti("sendTestSms")}
                </Text>
              </TouchableOpacity>
            )}
            {form.whatsappEnabled && (
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-green-50 py-3")}
                onPress={() => handleTest("whatsapp")}
                disabled={!!testingChannel || !testPhone.trim() || !!validateE164Phone(testPhone.trim())}
              >
                {testingChannel === "whatsapp" ? (
                  <ActivityIndicator size="small" color="#22c55e" />
                ) : (
                  <Ionicons name="logo-whatsapp" size={16} color="#22c55e" />
                )}
                <Text style={twStyle("ms-2 text-sm font-medium text-green-700")}>
                  {ti("sendTestWhatsapp")}
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
        title={ti("editTemplate")}
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
              <View style={twStyle("ms-3")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {selectedTemplate.name || templateTypeLabel(selectedTemplate.type, ti)}
                </Text>
                <Text style={twStyle("text-xs text-gray-400 capitalize")}>
                  {templateChannelLabel(selectedTemplate.channel, ti)}
                </Text>
              </View>
            </View>

            <Text style={twStyle("mb-1 text-xs text-gray-500")}>
              {ti("availableVariables")}
            </Text>

            <TextInput
              style={twStyle("mb-4 min-h-[120px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={templateText}
              onChangeText={setTemplateText}
              placeholder={ti("templatePlaceholder")}
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />

            <ActionButton
              label={ti("saveTemplate")}
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
