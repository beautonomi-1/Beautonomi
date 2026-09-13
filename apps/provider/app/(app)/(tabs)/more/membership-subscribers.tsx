import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/format";
import { getApiErrorMessage } from "@/lib/api-error";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";

type SubStatus = "all" | "active" | "cancelled" | "expired" | "past_due";

interface SubscriberRow {
  subscription: {
    id: string;
    plan_id: string;
    status: string;
    started_at: string | null;
    expires_at: string | null;
    cancelled_at: string | null;
    auto_renew?: boolean;
    next_billing_at?: string | null;
    last_payment_at?: string | null;
    past_due_since?: string | null;
    entitlement_active?: boolean;
  };
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  plan: {
    id: string;
    name: string;
    price_monthly: number | null;
    currency: string | null;
    is_active?: boolean | null;
  };
}

interface SubscribersResponse {
  subscribers: SubscriberRow[];
}

const STATUS_CHIP_KEYS: { labelKey: string; value: SubStatus }[] = [
  { labelKey: "filterAll", value: "all" },
  { labelKey: "statusActive", value: "active" },
  { labelKey: "statusPastDue", value: "past_due" },
  { labelKey: "statusCancelled", value: "cancelled" },
  { labelKey: "statusExpired", value: "expired" },
];

function statusColor(s: string): string {
  if (s === "active") return "#059669";
  if (s === "past_due") return "#DC2626";
  if (s === "cancelled") return "#6B7280";
  if (s === "expired") return "#6B7280";
  return "#6B7280";
}

function statusBgColor(s: string): string {
  if (s === "active") return "#D1FAE5";
  if (s === "past_due") return "#FEE2E2";
  if (s === "cancelled") return "#F3F4F6";
  if (s === "expired") return "#F3F4F6";
  return "#F3F4F6";
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export default function MembershipSubscribersScreen() {
  const { t } = useTranslation();
  const ms = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.membershipSubscribers.${key}`, opts) as string;
  const statusLabel = (s: string): string => {
    if (s === "active") return ms("statusActive");
    if (s === "past_due") return ms("statusPastDue");
    if (s === "cancelled") return ms("statusCancelled");
    if (s === "expired") return ms("statusExpired");
    return s;
  };
  const statusChips = STATUS_CHIP_KEYS.map((c) => ({ label: ms(c.labelKey), value: c.value }));
  const params = useLocalSearchParams<{
    planId?: string | string[];
    planName?: string | string[];
  }>();
  const planId = Array.isArray(params.planId) ? params.planId[0] : params.planId;
  const planNameParam = Array.isArray(params.planName) ? params.planName[0] : params.planName;
  const [statusFilter, setStatusFilter] = useState<SubStatus>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [manageRow, setManageRow] = useState<SubscriberRow | null>(null);
  const [extendIso, setExtendIso] = useState("");

  const queryUrl = useMemo(() => {
    const q = new URLSearchParams();
    q.set("status", statusFilter);
    if (planId && typeof planId === "string") {
      q.set("plan_id", planId);
    }
    return `/api/provider/membership-subscribers?${q.toString()}`;
  }, [statusFilter, planId]);

  const { data: rawData, loading, error: loadError, refresh } = useApi<SubscribersResponse>(
    queryUrl,
    { staleTimeMs: 15_000 },
  );
  const subscribers = useMemo(() => rawData?.subscribers ?? [], [rawData]);
  const { execute: patchSub, loading: patchLoading } = useApiMutation("patch");
  const { execute: postWinBack, loading: winBackLoading } = useApiMutation<{ sent?: boolean }>("post");
  const { execute: postExtend, loading: extendLoading } = useApiMutation("post");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openManage = useCallback((row: SubscriberRow) => {
    setExtendIso(
      row.subscription.expires_at
        ? row.subscription.expires_at.slice(0, 16)
        : "",
    );
    setManageRow(row);
  }, []);

  const closeManage = useCallback(() => {
    setManageRow(null);
  }, []);

  const onCancel = useCallback(
    async (row: SubscriberRow) => {
      Alert.alert(
        ms("cancelMembershipTitle"),
        ms("cancelMembershipBody", { name: row.user.full_name ?? ms("thisClient") }),
        [
          { text: ms("back"), style: "cancel" },
          {
            text: ms("cancelMembershipCta"),
            style: "destructive",
            onPress: async () => {
              const { error } = await patchSub(
                `/api/provider/membership-subscriptions/${row.subscription.id}`,
                { status: "cancelled" },
              );
              if (error) {
                Alert.alert(ms("errorTitle"), getApiErrorMessage(error, ms("couldNotUpdate")));
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              closeManage();
              await refresh();
            },
          },
        ],
      );
    },
    [patchSub, closeManage, refresh],
  );

  const onReactivate = useCallback(
    async (row: SubscriberRow) => {
      const { error } = await patchSub(
        `/api/provider/membership-subscriptions/${row.subscription.id}`,
        { status: "active" },
      );
      if (error) {
        Alert.alert(ms("errorTitle"), getApiErrorMessage(error, ms("couldNotUpdate")));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeManage();
      await refresh();
    },
    [patchSub, closeManage, refresh],
  );

  const onSendWinBack = useCallback(async () => {
    if (!manageRow) return;
    const { error } = await postWinBack(
      `/api/provider/membership-subscriptions/${manageRow.subscription.id}/win-back`,
      {},
    );
    if (error) {
      Alert.alert(ms("couldNotSendTitle"), getApiErrorMessage(error, ms("pleaseTryAgain")));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(ms("sentTitle"), ms("winBackSent"));
  }, [manageRow, postWinBack, t]);

  const onSaveExpiry = useCallback(async () => {
    if (!manageRow) return;
    if (!extendIso.trim()) {
      Alert.alert(ms("invalidDateTitle"), ms("pickEndDate"));
      return;
    }
    const parsed = new Date(extendIso.trim());
    if (!Number.isFinite(parsed.getTime())) {
      Alert.alert(ms("invalidDateTitle"), ms("enterValidDate"));
      return;
    }
    const current = manageRow.subscription.expires_at
      ? new Date(manageRow.subscription.expires_at)
      : new Date();
    const days = Math.max(1, Math.round((parsed.getTime() - current.getTime()) / (24 * 60 * 60 * 1000)));
    if (days > 365) {
      Alert.alert(ms("tooFarTitle"), ms("tooFarBody"));
      return;
    }
    const { error } = await postExtend(
      `/api/provider/membership-subscriptions/${manageRow.subscription.id}/extend`,
      { days, note: "Manual extend from members list" },
    );
    if (error) {
      Alert.alert(ms("errorTitle"), getApiErrorMessage(error, ms("couldNotExtend")));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeManage();
    await refresh();
  }, [manageRow, extendIso, postExtend, closeManage, refresh, t]);

  const subtitle =
    planId && planNameParam
      ? String(planNameParam)
      : ms("subtitleAll");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={ms("title")} showBack subtitle={subtitle} />

      <View style={twStyle("mb-3")}>
        <FilterChipGroup
          options={statusChips}
          selected={statusFilter}
          onSelect={(v) => setStatusFilter(v as SubStatus)}
        />
      </View>

      {loadError && !rawData ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : loading && !rawData && !loadError ? (
        <SkeletonList rows={5} />
      ) : subscribers.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={ms("emptyTitle")}
          description={
            statusFilter !== "all"
              ? ms("emptyFilter")
              : ms("emptyAll")
          }
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={subscribers}
          keyExtractor={(item: SubscriberRow) => item.subscription.id}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }: { item: SubscriberRow }) => {
            const st = item.subscription.status;
            const isPastDue = st === "past_due";
            return (
              <TouchableOpacity
                style={twStyle(
                  `rounded-xl border bg-white p-4 ${isPastDue ? "border-red-200" : st === "active" ? "border-green-100" : "border-gray-100"}`,
                )}
                onPress={() => openManage(item)}
                activeOpacity={0.75}
              >
                <View style={twStyle("flex-row items-center")}>
                  <Avatar
                    name={item.user.full_name ?? "?"}
                    imageUrl={item.user.avatar_url}
                    size="md"
                  />
                  <View style={twStyle("ms-3 flex-1")}>
                    <Text style={twStyle("text-base font-semibold text-gray-900")} numberOfLines={1}>
                      {item.user.full_name ?? ms("customerFallback")}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")} numberOfLines={1}>
                      {item.plan.name}
                      {item.plan.price_monthly != null && item.plan.currency
                        ? ms("priceMonthlySuffix", { amount: formatCurrency(item.plan.price_monthly) })
                        : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      twStyle("rounded-full px-2 py-0.5"),
                      { backgroundColor: statusBgColor(st) },
                    ]}
                  >
                    <Text style={[twStyle("text-[10px] font-bold"), { color: statusColor(st) }]}>
                      {statusLabel(st)}
                    </Text>
                  </View>
                </View>
                {/* Recurring billing info */}
                {(item.subscription.auto_renew || item.subscription.next_billing_at || item.subscription.last_payment_at) && (
                  <View style={twStyle("mt-2 flex-row flex-wrap gap-x-3")}>
                    {item.subscription.auto_renew && (
                      <Text style={twStyle("text-xs text-green-700")}>{ms("autoRenews")}</Text>
                    )}
                    {!item.subscription.auto_renew && st === "active" && (
                      <Text style={twStyle("text-xs text-gray-400")}>{ms("autoRenewOff")}</Text>
                    )}
                    {item.subscription.next_billing_at && (
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {ms("nextBilling", { date: formatDate(item.subscription.next_billing_at) })}
                      </Text>
                    )}
                    {item.subscription.last_payment_at && (
                      <Text style={twStyle("text-xs text-gray-400")}>
                        {ms("lastPaid", { date: formatDate(item.subscription.last_payment_at) })}
                      </Text>
                    )}
                  </View>
                )}
                <View style={twStyle("mt-2 flex-row flex-wrap")}>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {ms("started", { date: formatDate(item.subscription.started_at) })}
                  </Text>
                  <Text style={twStyle("mx-2 text-xs text-gray-300")}>·</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {item.subscription.expires_at
                      ? ms("renewsEnds", { date: formatDateTime(item.subscription.expires_at) })
                      : ms("noExpiry")}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <BottomSheet visible={!!manageRow} onClose={closeManage} title={ms("manageTitle")}>
        {manageRow && (
          <View>
            <Text style={twStyle("mb-2 text-sm text-gray-600")}>
              {ms("memberPlan", { name: manageRow.user.full_name ?? ms("customerFallback"), plan: manageRow.plan.name })}
            </Text>

            <Text style={twStyle("mb-1 text-xs font-semibold uppercase text-gray-400")}>
              {ms("expiryOptional")}
            </Text>
            <TextInput
              style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
              placeholder={ms("expiryPlaceholder")}
              placeholderTextColor="#9ca3af"
              value={extendIso}
              onChangeText={setExtendIso}
              autoCapitalize="none"
            />
            <View style={twStyle("mb-4 flex-row flex-wrap gap-2")}>
              {[
                { label: ms("plus7Days"), days: 7 },
                { label: ms("plus30Days"), days: 30 },
                { label: ms("plus90Days"), days: 90 },
              ].map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={twStyle("rounded-lg bg-gray-100 px-3 py-1.5")}
                  onPress={() => setExtendIso(addDaysIso(p.days).slice(0, 16))}
                >
                  <Text style={twStyle("text-xs font-medium text-gray-700")}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ActionButton
              label={ms("saveExpiry")}
              onPress={onSaveExpiry}
              loading={extendLoading || patchLoading}
              fullWidth
            />

            {manageRow.subscription.status === "active" ? (
              <TouchableOpacity
                style={twStyle("mt-3 items-center rounded-xl bg-red-50 py-3")}
                onPress={() => onCancel(manageRow)}
              >
                <Text style={twStyle("text-sm font-semibold text-red-700")}>{ms("cancelMembershipCta")}</Text>
              </TouchableOpacity>
            ) : manageRow.subscription.status === "cancelled" ? (
              <>
                <ActionButton
                  label={winBackLoading ? ms("sending") : ms("sendWinBack")}
                  onPress={() => void onSendWinBack()}
                  loading={winBackLoading}
                  fullWidth
                  style={{ marginTop: 12 }}
                />
                <TouchableOpacity
                  style={twStyle("mt-3 items-center rounded-xl bg-green-50 py-3")}
                  onPress={() => onReactivate(manageRow)}
                >
                  <Text style={twStyle("text-sm font-semibold text-green-800")}>{ms("markActiveAgain")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={twStyle("mt-3 items-center rounded-xl bg-green-50 py-3")}
                onPress={() => onReactivate(manageRow)}
              >
                <Text style={twStyle("text-sm font-semibold text-green-800")}>{ms("markActiveAgain")}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
