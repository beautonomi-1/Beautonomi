import { useState, useEffect } from "react";
import { View, Text, TextInput, Alert, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface EmailStats {
  total_sent: number;
  delivered: number;
  opened: number;
  delivery_rate: number;
}

interface EmailIntegration {
  id?: string;
  provider_name: string;
  api_key: string;
  from_email: string;
  from_name: string;
  is_enabled: boolean;
  connected_date: string | null;
  stats?: EmailStats;
}

const PROVIDERS = [
  { label: "SendGrid", value: "sendgrid", icon: "mail-outline" as const, color: "#0ea5e9" },
  { label: "Mailchimp", value: "mailchimp", icon: "megaphone-outline" as const, color: "#f59e0b" },
];

export default function EmailIntegrationScreen() {
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
      setApiKey(integration.api_key);
      setFromEmail(integration.from_email);
      setFromName(integration.from_name);
      setIsEnabled(integration.is_enabled);
    }
  }, [integration]);

  async function handleSave() {
    if (!apiKey.trim() || !fromEmail.trim()) {
      Alert.alert("Required", "API key and from email are required");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail.trim())) {
      Alert.alert("Invalid", "Please enter a valid email address");
      return;
    }
    const { error } = await saveIntegration("/api/provider/email-integration", {
      provider_name: provider,
      api_key: apiKey.trim(),
      from_email: fromEmail.trim(),
      from_name: fromName.trim() || "Beautonomi",
      is_enabled: isEnabled,
    });
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  async function handleTestConnection() {
    setTestResult(null);
    const { error } = await testConnection("/api/provider/email-integration/test", {
      provider_name: provider,
      api_key: apiKey.trim(),
    });
    if (error) {
      setTestResult({ success: false, message: error });
    } else {
      setTestResult({ success: true, message: "Connection successful!" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  async function handleSendTest() {
    if (!fromEmail.trim()) {
      Alert.alert("Required", "From email is required to send a test");
      return;
    }
    const { error } = await sendTestEmail("/api/provider/email-integration/send-test", {
      to_email: fromEmail.trim(),
    });
    if (error) {
      Alert.alert("Error", error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent", `Test email sent to ${fromEmail}`);
    }
  }

  function maskedKey(key: string): string {
    if (!key || key.length < 8) return "••••••••";
    return key.substring(0, 4) + "••••" + key.substring(key.length - 4);
  }

  if (loading && !integration) return <LoadingState />;

  const stats = integration?.stats;

  return (
    <ScreenContainer>
      <ScreenHeader title="Email Integration" showBack subtitle="SendGrid or Mailchimp" />

      {/* Connection status */}
      {integration?.connected_date && (
        <View style={twStyle("mb-4 rounded-xl bg-green-50 p-3")}>
          <View style={twStyle("flex-row items-center")}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={twStyle("ml-1.5 text-sm text-green-700")}>
              Connected since {new Date(integration.connected_date).toLocaleDateString()}
            </Text>
          </View>
        </View>
      )}

      {/* Email stats */}
      {stats && (
        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <StatCard title="Sent" value={String(stats.total_sent)} icon="send-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
          </View>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <StatCard title="Delivered" value={`${(stats.delivery_rate * 100).toFixed(0)}%`} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard title="Opened" value={String(stats.opened)} icon="mail-open-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
          </View>
        </View>
      )}

      {/* Provider selection */}
      <SectionHeader title="Email Provider" />
      <View style={twStyle("mb-4 flex-row")}>
        {PROVIDERS.map((p, i) => (
          <TouchableOpacity
            key={p.value}
            style={[twStyle(`flex-1 items-center rounded-xl border-2 p-4 ${
              provider === p.value
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 bg-white"
            }`), i < PROVIDERS.length - 1 ? { marginRight: 12 } : undefined]}
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
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Configuration */}
      <SectionHeader title="Configuration" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between mb-4")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>Enabled</Text>
            <Text style={twStyle("text-xs text-gray-500")}>Activate email sending</Text>
          </View>
          <Switch
            value={isEnabled}
            onValueChange={setIsEnabled}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={isEnabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>API Key *</Text>
        <View style={twStyle("mb-3 flex-row items-center")}>
          <TextInput
            style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
            value={showKey ? apiKey : maskedKey(apiKey)}
            onChangeText={setApiKey}
            onFocus={() => setShowKey(true)}
            placeholder={provider === "sendgrid" ? "SG.xxxxx..." : "xxxxx-us1"}
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

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>From Email *</Text>
        <TextInput
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={fromEmail}
          onChangeText={setFromEmail}
          placeholder="noreply@yourbusiness.com"
          placeholderTextColor="#9ca3af"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>From Name</Text>
        <TextInput
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={fromName}
          onChangeText={setFromName}
          placeholder="Your Business Name"
          placeholderTextColor="#9ca3af"
        />

        <ActionButton label="Save Integration" onPress={handleSave} loading={saving} fullWidth />
      </View>

      {/* Test connection */}
      <SectionHeader title="Testing" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        {testResult && (
          <View style={twStyle(`mb-3 rounded-lg p-3 ${testResult.success ? "bg-green-50" : "bg-red-50"}`)}>
            <View style={twStyle("flex-row items-center")}>
              <Ionicons
                name={testResult.success ? "checkmark-circle" : "alert-circle"}
                size={16}
                color={testResult.success ? "#22c55e" : "#ef4444"}
              />
              <Text style={twStyle(`ml-1.5 text-sm ${testResult.success ? "text-green-700" : "text-red-700"}`)}>
                {testResult.message}
              </Text>
            </View>
          </View>
        )}

        <View style={twStyle("flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <ActionButton
              label="Test Connection"
              variant="outline"
              onPress={handleTestConnection}
              loading={testing}
              fullWidth
            />
          </View>
          <View style={twStyle("flex-1")}>
            <ActionButton
              label="Send Test Email"
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
