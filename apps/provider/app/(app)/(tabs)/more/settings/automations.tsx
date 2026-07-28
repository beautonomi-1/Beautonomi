/**
 * Provider marketing automations — parity with apps/web provider/marketing/automations/page.tsx
 */
import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import {
  mapTriggerToCategory,
  formatTriggerLabel,
  categoryToTabKey,
  type AutomationCategory,
  type AutomationTabKey,
} from "@/lib/marketing/automation-mapping";
import { AutomationMessageEditor } from "@/components/marketing/AutomationMessageEditor";
import { AutomationExecutionHistory } from "@/components/marketing/AutomationExecutionHistory";

interface AutomationRow {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  is_active: boolean;
  is_template?: boolean;
  description?: string | null;
  trigger_config?: Record<string, unknown> | null;
  action_config?: Record<string, unknown> | null;
  delay_minutes?: number | null;
  created_at?: string;
}

interface TwilioBalancePayload {
  balance?: number | null;
  estimatedMessagesRemaining?: number | null;
  hasIntegration?: boolean;
}

type MappedAutomation = {
  id: string;
  category: AutomationCategory;
  triggerLabel: string;
  name: string;
  description: string;
  /** Switch value — templates always show off until a new row is created */
  displayActive: boolean;
  is_template: boolean;
  raw: AutomationRow;
};

const TAB_ITEMS: { key: AutomationTabKey; label: string }[] = [
  { key: "reminders", label: "Reminders" },
  { key: "updates", label: "Updates" },
  { key: "bookings", label: "Bookings" },
  { key: "milestones", label: "Milestones" },
];

function buildMapped(rows: AutomationRow[]): MappedAutomation[] {
  return rows.map((auto) => {
    const isTemplate = auto.is_template === true;
    const category = mapTriggerToCategory(auto.trigger_type);
    return {
      id: auto.id,
      category,
      triggerLabel: formatTriggerLabel(auto.trigger_type, auto.trigger_config),
      name: auto.name,
      description: (auto.description && String(auto.description).trim()) || "Automated message",
      displayActive: isTemplate ? false : !!auto.is_active,
      is_template: isTemplate,
      raw: auto,
    };
  });
}

function actionConfigString(cfg: Record<string, unknown> | null | undefined, key: string): string {
  if (!cfg || typeof cfg !== "object") return "";
  const v = cfg[key];
  return typeof v === "string" ? v : "";
}

export default function AutomationsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<AutomationTabKey>("reminders");
  const [messageEditRow, setMessageEditRow] = useState<MappedAutomation | null>(null);
  const [historyRow, setHistoryRow] = useState<MappedAutomation | null>(null);

  const {
    data: automations,
    loading,
    error,
    errorCode,
    refresh,
  } = useApi<AutomationRow[]>("/api/provider/automations");
  const {
    data: balancePayload,
    loading: balanceLoading,
    refresh: refreshBalance,
  } = useApi<TwilioBalancePayload>("/api/provider/twilio-integration/balance");

  const { execute: updateAutomation } = useApiMutation("patch");
  const { execute: createAutomationFromTemplate, loading: creatingFromTemplate } = useApiMutation("post");

  const mapped = useMemo(() => (automations?.length ? buildMapped(automations) : []), [automations]);

  const filtered = useMemo(
    () => mapped.filter((m) => categoryToTabKey(m.category) === activeTab),
    [mapped, activeTab],
  );

  const smsRemaining =
    balancePayload?.hasIntegration && balancePayload.estimatedMessagesRemaining != null
      ? balancePayload.estimatedMessagesRemaining
      : null;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshBalance()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshBalance]);

  const subscriptionBlocked =
    errorCode === "SUBSCRIPTION_REQUIRED" ||
    (!!error &&
      error.toLowerCase().includes("subscription") &&
      (error.toLowerCase().includes("upgrade") || error.toLowerCase().includes("plan")));

  function openSubscriptionHelp() {
    router.push("/(app)/(tabs)/more/settings/subscription" as never);
  }

  async function handleActivateTemplate(raw: AutomationRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await createAutomationFromTemplate("/api/provider/automations", {
      name: raw.name,
      trigger_type: raw.trigger_type,
      trigger_config: raw.trigger_config ?? {},
      action_type: raw.action_type || "sms",
      action_config: raw.action_config ?? {},
      delay_minutes: raw.delay_minutes ?? 0,
      is_active: true,
      ...(raw.description ? { description: raw.description } : {}),
    });
    if (err) Alert.alert("Error", err);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  async function handleToggle(row: MappedAutomation, newValue: boolean) {
    if (row.is_template) {
      if (!newValue) return;
      await handleActivateTemplate(row.raw);
      return;
    }
    const { error: err } = await updateAutomation(`/api/provider/automations/${row.id}`, {
      is_active: newValue,
    });
    if (err) Alert.alert("Error", err);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  if (loading && !automations) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading automations..." />
      </ScreenContainer>
    );
  }

  if (subscriptionBlocked && !automations) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Automations" showBack subtitle="Automated messages" />
        <View style={twStyle("flex-1 justify-center px-6")}>
          <Text style={twStyle("mb-2 text-center text-base text-gray-800")}>
            Marketing automations require a subscription that includes this feature.
          </Text>
          <Text style={twStyle("mb-6 text-center text-sm text-gray-600")}>
            Upgrade your platform plan under Subscription to use marketing automations.
          </Text>
          <ActionButton label="View plans & billing" onPress={openSubscriptionHelp} fullWidth />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !automations && !subscriptionBlocked) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Automations" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Automations"
        showBack
        subtitle="Set up automated messages and reminders"
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/settings/automations-create" as never);
            }}
            style={twStyle("flex-row items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2")}
          >
            <Ionicons name="add" size={16} color="#4338ca" style={{ marginRight: 6 }} />
            <Text style={twStyle("text-sm font-semibold text-indigo-800")}>Create</Text>
          </TouchableOpacity>
        }
      />

      <View style={twStyle("mb-4 rounded-xl border border-pink-100 bg-pink-50/80 px-3 py-2.5")}>
        <Text style={twStyle("text-xs text-gray-700 leading-5")}>
          SMS is included with your platform subscription; volume follows your plan limits.
        </Text>
      </View>

      {/* Quick links — parity with web SectionCards */}
      <View style={twStyle("mb-4 gap-3")}>
        <View style={twStyle("flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-xs text-gray-500")}>Text messages remaining</Text>
            {balanceLoading ? (
              <ActivityIndicator style={twStyle("mt-2")} />
            ) : (
              <Text style={twStyle("mt-1 text-2xl font-semibold text-gray-900")}>
                {smsRemaining !== null ? smsRemaining.toLocaleString() : "N/A"}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              refreshBalance();
            }}
            style={twStyle("rounded-lg border border-gray-200 px-3 py-2")}
          >
            <Text style={twStyle("text-xs font-semibold text-gray-700")}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/express-booking" as never)}
          style={twStyle("flex-row items-center justify-between rounded-2xl border border-blue-100 bg-sky-50/80 p-4")}
        >
          <View style={twStyle("flex-1 pr-2")}>
            <Text style={twStyle("text-sm font-semibold text-gray-800")}>Express booking links</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>Quick links for clients</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#2563eb" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/marketing-hub" as never)}
          style={twStyle("flex-row items-center justify-between rounded-2xl border border-purple-100 bg-purple-50/80 p-4")}
        >
          <View style={twStyle("flex-1 pr-2")}>
            <Text style={twStyle("text-sm font-semibold text-gray-800")}>Marketing campaigns</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>Email & SMS campaigns</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#7c3aed" />
        </TouchableOpacity>
      </View>

      {/* Category tabs */}
      <Text style={twStyle("mb-2 text-xs font-medium uppercase tracking-wide text-gray-500")}>Category</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={twStyle("gap-2 pb-4")}
        style={twStyle("mb-2 max-h-11")}
      >
        {TAB_ITEMS.map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab(t.key);
              }}
              style={
                active
                  ? twStyle("rounded-full bg-gray-900 px-4 py-2")
                  : twStyle("rounded-full border border-gray-200 bg-white px-4 py-2")
              }
            >
              <Text
                style={
                  active
                    ? twStyle("text-sm font-medium text-white")
                    : twStyle("text-sm font-medium text-gray-700")
                }
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <>
          <EmptyState
            icon="flash-outline"
            title={`No ${TAB_ITEMS.find((x) => x.key === activeTab)?.label.toLowerCase() ?? "tab"} yet`}
            description="Templates normally appear here automatically. Reload the list or open Marketing campaigns for a one-off send."
          />
          <View style={twStyle("mt-4 flex-row flex-wrap gap-2")}>
            <TouchableOpacity
              onPress={() => refresh()}
              style={twStyle("rounded-xl border border-gray-200 px-4 py-2.5")}
            >
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Reload automations</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/marketing-hub" as never)}
              style={twStyle("rounded-xl bg-[#FF0077] px-4 py-2.5")}
            >
              <Text style={twStyle("text-sm font-semibold text-white")}>Create a campaign</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        filtered.map((row) => (
          <View
            key={row.id}
            style={twStyle("mb-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm")}
          >
            <View style={twStyle("flex-row items-start justify-between gap-2")}>
              <View style={twStyle("min-w-0 flex-1")}>
                <Text style={twStyle("font-semibold text-gray-900")}>{row.name}</Text>
                <Text style={twStyle("mt-1 text-sm text-gray-600")} numberOfLines={3}>
                  {row.description}
                </Text>
                <View style={twStyle("mt-2 self-start rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5")}>
                  <Text style={twStyle("text-xs text-gray-700")}>{row.triggerLabel}</Text>
                </View>
              </View>
              <Switch
                value={row.displayActive}
                onValueChange={(v) => handleToggle(row, v)}
                disabled={creatingFromTemplate && row.is_template}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
              />
            </View>
            <View style={twStyle("mt-3 flex-row gap-2")}>
              <TouchableOpacity
                onPress={() => setMessageEditRow(row)}
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 py-2.5")}
              >
                <Ionicons name="create-outline" size={18} color="#374151" style={{ marginRight: 6 }} />
                <Text style={twStyle("text-sm font-medium text-gray-800")}>Edit message</Text>
              </TouchableOpacity>
              {!row.is_template ? (
                <TouchableOpacity
                  onPress={() => setHistoryRow(row)}
                  style={twStyle("rounded-xl border border-gray-200 px-3 py-2.5")}
                  accessibilityLabel="Execution history"
                >
                  <Ionicons name="time-outline" size={20} color="#374151" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))
      )}

      <View style={twStyle("h-6")} />

      {messageEditRow && (
        <AutomationMessageEditor
          visible={true}
          onClose={() => setMessageEditRow(null)}
          automation={{
            id: messageEditRow.id,
            name: messageEditRow.name,
            triggerLabel: messageEditRow.triggerLabel,
            action_type: messageEditRow.raw.action_type,
            message_template: actionConfigString(messageEditRow.raw.action_config, "message_template"),
            subject: actionConfigString(messageEditRow.raw.action_config, "subject"),
          }}
          onSaved={() => refresh()}
        />
      )}

      <AutomationExecutionHistory
        visible={!!historyRow}
        onClose={() => setHistoryRow(null)}
        automationId={historyRow && !historyRow.is_template ? historyRow.id : null}
        automationName={historyRow?.name ?? ""}
      />
    </ScreenContainer>
  );
}
