import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Alert, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";
import { showPlanGateAlert } from "@/lib/plan-gate";

interface EmailIntegration {
  id?: string;
  provider_name: string;
  api_key: string;
  from_email: string;
  from_name: string;
  is_enabled: boolean;
  connected_date: string | null;
}

const PROVIDERS = [
  { labelKey: "providerSendgrid", value: "sendgrid", icon: "mail-outline" as const, color: "#0ea5e9" },
  { labelKey: "providerMailchimp", value: "mailchimp", icon: "megaphone-outline" as const, color: "#f59e0b" },
];

const MASKED_KEY = "••••••••";

function formatDateSafe(value: unknown, empty: string): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return empty;
  return parsed.toLocaleDateString();
}

export default function EmailIntegrationScreen() {
  const { t } = useTranslation();
  const ei = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.emailIntegration.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { data: integration, loading, refresh } = useApi<EmailIntegration | null>(
    "/api/provider/email-integration"
  );
  const { execute: saveIntegration, loading: saving } = useApiMutation("put");
  const { execute: testConnection, loading: testing } = useApiMutation("post");
  const { execute: sendTestEmail, loading: sendingTest } = useApiMutation("post");

  const [provider, setProvider] = useState("sendgrid");
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (integration) {
      setProvider(integration.provider_name);
      setApiKey(integration.api_key || "");
      setFromEmail(integration.from_email);
      setFromName(integration.from_name);
      setIsEnabled(integration.is_enabled);
    }
  }, [integration]);

  async function handleSave() {
    const keyForSave = apiKey.trim();
    const hasKey = keyForSave && keyForSave !== MASKED_KEY;
    if ((!hasKey && !integration?.id) || !fromEmail.trim()) {
      Alert.alert(ei("requiredTitle"), ei("requiredFields"));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail.trim())) {
      Alert.alert(ei("invalidTitle"), ei("invalidEmail"));
      return;
    }
    const payload: Record<string, unknown> = {
      provider_name: provider,
      from_email: fromEmail.trim(),
      from_name: fromName.trim() || "Beautonomi",
      is_enabled: isEnabled,
    };
    if (hasKey) {
      payload.api_key = keyForSave;
    } else if (integration?.id) {
      payload.api_key = MASKED_KEY;
    }
    const { error, errorCode } = await saveIntegration("/api/provider/email-integration", payload);
    if (error) {
      showPlanGateAlert({ title: ei("saveFailed"), message: error, errorCode, router });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  const savedProvider = integration?.provider_name ?? provider;

  async function handleTestConnection() {
    if (savedProvider !== "mailchimp") {
      Alert.alert(ei("requiredTitle"), ei("testConnectionMailchimpOnly"));
      return;
    }
    setTestResult(null);
    const { error } = await testConnection("/api/provider/email-integration/test", {
      ping: true,
    });
    if (error) {
      setTestResult({ success: false, message: error });
    } else {
      setTestResult({ success: true, message: ei("connectionSuccess") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  async function handleSendTest() {
    if (!fromEmail.trim()) {
      Alert.alert(ei("requiredTitle"), ei("fromEmailRequired"));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail.trim())) {
      Alert.alert(ei("invalidTitle"), ei("invalidEmail"));
      return;
    }
    if (!integration?.is_enabled && !isEnabled) {
      Alert.alert(ei("requiredTitle"), ei("enabledHint"));
      return;
    }
    const { error } = await sendTestEmail("/api/provider/email-integration/test", {
      test_email: fromEmail.trim(),
    });
    if (error) {
      Alert.alert(ei("errorTitle"), error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(ei("sentTitle"), ei("testSent", { email: fromEmail.trim() }));
      refresh();
    }
  }

  function maskedKey(key: string): string {
    if (!key || key === MASKED_KEY) return ei("maskedKey");
    if (key.length < 8) return ei("maskedKey");
    return key.substring(0, 4) + "••••" + key.substring(key.length - 4);
  }

  if (loading && !integration) return <LoadingState />;

  return (
    <ScreenContainer>
      <ScreenHeader title={ei("title")} showBack subtitle={ei("subtitle")} />

      {integration?.connected_date && (
        <View style={twStyle("mb-4 rounded-xl bg-green-50 p-3")}>
          <View style={twStyle("flex-row items-center")}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={twStyle("ms-1.5 text-sm text-green-700")}>
              {ei("connectedSince", { date: formatDateSafe(integration.connected_date, ei("emptyValue")) })}
            </Text>
          </View>
        </View>
      )}

      <SectionHeader title={ei("emailProvider")} />
      <View style={twStyle("mb-4 flex-row")}>
        {PROVIDERS.map((p, i) => (
          <TouchableOpacity
            key={p.value}
            style={[twStyle(`flex-1 items-center rounded-xl border-2 p-4 ${
              provider === p.value
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 bg-white"
            }`), i < PROVIDERS.length - 1 ? { marginEnd: 12 } : undefined]}
            onPress={() => setProvider(p.value)}
          >
            <Ionicons
              name={p.icon}
              size={24}
              color={provider === p.value ? "#6366f1" : "#9ca3af"}
            />
            <Text
              style={twStyle(`mt-1.5 text-sm font-medium ${
                provider === p.value ? "text-indigo-700" : "text-gray-600"
              }`)}
            >
              {ei(p.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {provider === "mailchimp" && (
        <Text style={twStyle("mb-4 text-xs text-blue-700 px-1")}>{ei("mailchimpNote")}</Text>
      )}
      {integration && provider !== integration.provider_name && (
        <Text style={twStyle("mb-4 text-xs text-amber-800 px-1")}>{ei("providerSwitchRequiresNewKey")}</Text>
      )}

      <SectionHeader title={ei("configuration")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between mb-4")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>{ei("enabled")}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{ei("enabledHint")}</Text>
          </View>
          <Switch
            value={isEnabled}
            onValueChange={setIsEnabled}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={isEnabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ei("apiKey")}</Text>
        <View style={twStyle("mb-3 flex-row items-center")}>
          <TextInput
            style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginEnd: 8 }]}
            value={showKey ? apiKey : maskedKey(apiKey)}
            onChangeText={setApiKey}
            onFocus={() => setShowKey(true)}
            placeholder={provider === "sendgrid" ? ei("placeholderSendgrid") : ei("placeholderMailchimp")}
            placeholderTextColor="#9ca3af"
            secureTextEntry={!showKey}
          />
          <TouchableOpacity
            style={twStyle("h-12 w-12 items-center justify-center rounded-xl bg-gray-100")}
            onPress={() => setShowKey(!showKey)}
          >
            <Ionicons name={showKey ? "eye-off-outline" : "eye-outline"} size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>
        {provider === "mailchimp" && (
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>{ei("mailchimpKeyHint")}</Text>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ei("fromEmail")}</Text>
        <TextInput
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={fromEmail}
          onChangeText={setFromEmail}
          placeholder={ei("fromEmailPlaceholder")}
          placeholderTextColor="#9ca3af"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {provider === "mailchimp" && (
          <Text style={twStyle("mb-2 text-xs text-gray-500")}>{ei("mailchimpFromHint")}</Text>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ei("fromName")}</Text>
        <TextInput
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={fromName}
          onChangeText={setFromName}
          placeholder={ei("fromNamePlaceholder")}
          placeholderTextColor="#9ca3af"
        />

        <ActionButton label={ei("save")} onPress={handleSave} loading={saving} fullWidth />
      </View>

      <SectionHeader title={ei("testing")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        {savedProvider === "mailchimp" && (
          <Text style={twStyle("mb-3 text-xs text-gray-600")}>{ei("mailchimpTestHint")}</Text>
        )}
        {testResult && (
          <View style={twStyle(`mb-3 rounded-lg p-3 ${testResult.success ? "bg-green-50" : "bg-red-50"}`)}>
            <View style={twStyle("flex-row items-center")}>
              <Ionicons
                name={testResult.success ? "checkmark-circle" : "alert-circle"}
                size={16}
                color={testResult.success ? "#22c55e" : "#ef4444"}
              />
              <Text style={twStyle(`ms-1.5 text-sm ${testResult.success ? "text-green-700" : "text-red-700"}`)}>
                {testResult.message}
              </Text>
            </View>
          </View>
        )}

        <View style={twStyle("flex-row")}>
          {savedProvider === "mailchimp" ? (
            <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
              <ActionButton
                label={ei("testConnection")}
                variant="outline"
                onPress={handleTestConnection}
                loading={testing}
                fullWidth
              />
            </View>
          ) : null}
          <View style={twStyle("flex-1")}>
            <ActionButton
              label={ei("sendTestEmail")}
              variant="outline"
              onPress={handleSendTest}
              loading={sendingTest}
              fullWidth
            />
          </View>
        </View>
      </View>

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
