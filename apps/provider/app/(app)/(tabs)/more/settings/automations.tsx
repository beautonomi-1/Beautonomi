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
import { useTranslation } from "@beautonomi/i18n";
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
import { isPlanGateErrorCode, showPlanGateAlert } from "@/lib/plan-gate";
import {
  mapTriggerToCategory,
  formatTriggerLabel,
  categoryToTabKey,
  type AutomationCategory,
  type AutomationTabKey,
} from "@/lib/marketing/automation-mapping";
import { AutomationMessageEditor } from "@/components/marketing/AutomationMessageEditor";
import { AutomationExecutionHistory } from "@/components/marketing/AutomationExecutionHistory";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

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

const TAB_ITEMS: { key: AutomationTabKey; labelKey: "tabReminders" | "tabUpdates" | "tabBookings" | "tabMilestones" }[] = [
  { key: "reminders", labelKey: "tabReminders" },
  { key: "updates", labelKey: "tabUpdates" },
  { key: "bookings", labelKey: "tabBookings" },
  { key: "milestones", labelKey: "tabMilestones" },
];

const EMPTY_TITLE_KEYS: Record<AutomationTabKey, "emptyReminders" | "emptyUpdates" | "emptyBookings" | "emptyMilestones"> = {
  reminders: "emptyReminders",
  updates: "emptyUpdates",
  bookings: "emptyBookings",
  milestones: "emptyMilestones",
};

function buildMapped(rows: AutomationRow[], automatedMessage: string): MappedAutomation[] {
  return rows.map((auto) => {
    const isTemplate = auto.is_template === true;
    const category = mapTriggerToCategory(auto.trigger_type);
    return {
      id: auto.id,
      category,
      triggerLabel: formatTriggerLabel(auto.trigger_type, auto.trigger_config),
      name: auto.name,
      description: (auto.description && String(auto.description).trim()) || automatedMessage,
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
  const { t } = useTranslation();
  const au = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.automations.${key}`, opts) as string,
    [t],
  );
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

  const mapped = useMemo(
    () => (automations?.length ? buildMapped(automations, au("automatedMessage")) : []),
    [automations, au],
  );

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

  const subscriptionBlocked = isPlanGateErrorCode(errorCode);

  function openSubscriptionHelp() {
    router.push("/(app)/(tabs)/more/settings/subscription" as never);
  }

  async function handleActivateTemplate(raw: AutomationRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err, errorCode } = await createAutomationFromTemplate("/api/provider/automations", {
      name: raw.name,
      trigger_type: raw.trigger_type,
      trigger_config: raw.trigger_config ?? {},
      action_type: raw.action_type || "sms",
      action_config: raw.action_config ?? {},
      delay_minutes: raw.delay_minutes ?? 0,
      is_active: true,
      ...(raw.description ? { description: raw.description } : {}),
    });
    if (err) {
      if (isPlanGateErrorCode(errorCode)) {
        showPlanGateAlert({ message: err, errorCode, router });
      } else {
        Alert.alert(au("errorTitle"), err);
      }
    } else {
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
    const { error: err, errorCode: toggleCode } = await updateAutomation(`/api/provider/automations/${row.id}`, {
      is_active: newValue,
    });
    if (err) {
      if (isPlanGateErrorCode(toggleCode)) {
        showPlanGateAlert({ message: err, errorCode: toggleCode, router });
      } else {
        Alert.alert(au("errorTitle"), err);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  if (loading && !automations) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message={au("loading")} />
      </ScreenContainer>
    );
  }

  if (subscriptionBlocked && !automations) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={au("title")} showBack subtitle={au("subtitleShort")} />
        <View style={twStyle("flex-1 justify-center px-6")}>
          <Text style={twStyle("mb-2 text-center text-base text-gray-800")}>
            {au("planRequired")}
          </Text>
          <Text style={twStyle("mb-6 text-center text-sm text-gray-600")}>
            {au("planUpgradeHint")}
          </Text>
          <ActionButton label={au("viewPlans")} onPress={openSubscriptionHelp} fullWidth />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !automations && !subscriptionBlocked) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={au("title")} showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title={au("title")}
        showBack
        subtitle={au("subtitle")}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/settings/automations-create" as never);
            }}
            style={twStyle("flex-row items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2")}
          >
            <Ionicons name="add" size={16} color="#4338ca" style={{ marginEnd: 6 }} />
            <Text style={twStyle("text-sm font-semibold text-indigo-800")}>{au("create")}</Text>
          </TouchableOpacity>
        }
      />

      <View style={twStyle("mb-4 rounded-xl border border-pink-100 bg-pink-50/80 px-3 py-2.5")}>
        <Text style={twStyle("text-xs text-gray-700 leading-5")}>
          {au("smsIncluded")}
        </Text>
      </View>

      {/* Quick links — parity with web SectionCards */}
      <View style={twStyle("mb-4 gap-3")}>
        <View style={twStyle("flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-xs text-gray-500")}>{au("smsRemaining")}</Text>
            {balanceLoading ? (
              <ActivityIndicator style={twStyle("mt-2")} />
            ) : (
              <Text style={twStyle("mt-1 text-2xl font-semibold text-gray-900")}>
                {smsRemaining !== null ? smsRemaining.toLocaleString() : au("notAvailable")}
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
            <Text style={twStyle("text-xs font-semibold text-gray-700")}>{au("refresh")}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/express-booking" as never)}
          style={twStyle("flex-row items-center justify-between rounded-2xl border border-blue-100 bg-sky-50/80 p-4")}
        >
          <View style={twStyle("flex-1 pe-2")}>
            <Text style={twStyle("text-sm font-semibold text-gray-800")}>{au("expressLinks")}</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>{au("expressLinksHint")}</Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={20} color="#2563eb" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/marketing-hub" as never)}
          style={twStyle("flex-row items-center justify-between rounded-2xl border border-purple-100 bg-purple-50/80 p-4")}
        >
          <View style={twStyle("flex-1 pe-2")}>
            <Text style={twStyle("text-sm font-semibold text-gray-800")}>{au("marketingCampaigns")}</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>{au("marketingCampaignsHint")}</Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={20} color="#7c3aed" />
        </TouchableOpacity>
      </View>

      {/* Category tabs */}
      <Text style={twStyle("mb-2 text-xs font-medium uppercase tracking-wide text-gray-500")}>{au("category")}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={twStyle("gap-2 pb-4")}
        style={twStyle("mb-2 max-h-11")}
      >
        {TAB_ITEMS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab(tab.key);
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
                {au(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <>
          <EmptyState
            icon="flash-outline"
            title={au(EMPTY_TITLE_KEYS[activeTab] ?? "emptyFallback")}
            description={au("emptyDescription")}
          />
          <View style={twStyle("mt-4 flex-row flex-wrap gap-2")}>
            <TouchableOpacity
              onPress={() => refresh()}
              style={twStyle("rounded-xl border border-gray-200 px-4 py-2.5")}
            >
              <Text style={twStyle("text-sm font-medium text-gray-700")}>{au("reload")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/marketing-hub" as never)}
              style={twStyle("rounded-xl bg-[#FF0077] px-4 py-2.5")}
            >
              <Text style={twStyle("text-sm font-semibold text-white")}>{au("createCampaign")}</Text>
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
                <Ionicons name="create-outline" size={18} color="#374151" style={{ marginEnd: 6 }} />
                <Text style={twStyle("text-sm font-medium text-gray-800")}>{au("editMessage")}</Text>
              </TouchableOpacity>
              {!row.is_template ? (
                <TouchableOpacity
                  onPress={() => setHistoryRow(row)}
                  style={twStyle("rounded-xl border border-gray-200 px-3 py-2.5")}
                  accessibilityLabel={au("historyA11y")}
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
