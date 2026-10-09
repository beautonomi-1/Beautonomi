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

  const { data: integration, loading, refresh } = useApi<TwilioIntegration>("/api/provider/twilio-integration");
  const { data: balanceInfo } = useApi<BalanceInfo>("/api/provider/twilio-integration/balance");
  const { execute: saveConfig, loading: saving } = useApiMutation<any>("put");
  const { execute: sendTest } = useApiPost<any, any>("/api/provider/twilio-integration/test");

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

      {integration?.connected_date && (
        <View style={twStyle("mb-4 flex-row items-center rounded-lg bg-green-50 px-3 py-2")}>
          <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          <Text style={twStyle("ms-2 text-xs text-green-700")}>
            {ti("connectedSince", { date: formatDateSafe(integration.connected_date, ti("dateUnavailable")) })}
          </Text>
        </View>
      )}

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
          <>
            <View style={twStyle("mb-3 flex-row rounded-xl bg-amber-50 px-3 py-2")}>
              <Ionicons name="information-circle-outline" size={18} color="#d97706" style={twStyle("mt-0.5")} />
              <Text style={twStyle("ms-2 flex-1 text-xs text-amber-900")}>{ti("whatsappCampaignLimitHint")}</Text>
            </View>
            <E164PhoneField
              label={ti("whatsappFromNumber")}
              valueE164={form.whatsappFrom}
              onChangeE164={(v) => update("whatsappFrom", v)}
              placeholderNational={ti("phoneNumberPlaceholder")}
              showHint
            />
          </>
        )}
      </View>

      <ActionButton
        label={ti("saveConfiguration")}
        onPress={handleSave}
        loading={saving}
        disabled={!dirty}
        fullWidth
      />

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
    </ScreenContainer>
  );
}
