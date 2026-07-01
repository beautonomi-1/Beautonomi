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

const STATUS_CHIPS: { label: string; value: SubStatus }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Past due", value: "past_due" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Expired", value: "expired" },
];

function statusLabel(s: string): string {
  if (s === "active") return "Active";
  if (s === "past_due") return "Past due";
  if (s === "cancelled") return "Cancelled";
  if (s === "expired") return "Expired";
  return s;
}

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
        "Cancel membership",
        `End membership for ${row.user.full_name ?? "this client"}? They can rejoin by purchasing again.`,
        [
          { text: "Back", style: "cancel" },
          {
            text: "Cancel membership",
            style: "destructive",
            onPress: async () => {
              const { error } = await patchSub(
                `/api/provider/membership-subscriptions/${row.subscription.id}`,
                { status: "cancelled" },
              );
              if (error) {
                Alert.alert("Error", getApiErrorMessage(error, "Could not update"));
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
        Alert.alert("Error", getApiErrorMessage(error, "Could not update"));
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
      Alert.alert("Could not send", getApiErrorMessage(error, "Please try again"));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Sent", "Membership reminder sent to the client.");
  }, [manageRow, postWinBack]);

  const onSaveExpiry = useCallback(async () => {
    if (!manageRow) return;
    let expiresAt: string | null = null;
    if (extendIso.trim()) {
      const parsed = new Date(extendIso.trim());
      if (!Number.isFinite(parsed.getTime())) {
        Alert.alert("Invalid date", "Enter a valid date / time.");
        return;
      }
      expiresAt = parsed.toISOString();
    } else {
      expiresAt = null;
    }
    const { error } = await patchSub(
      `/api/provider/membership-subscriptions/${manageRow.subscription.id}`,
      { expires_at: expiresAt },
    );
    if (error) {
      Alert.alert("Error", getApiErrorMessage(error, "Could not update"));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeManage();
    await refresh();
  }, [manageRow, extendIso, patchSub, closeManage, refresh]);

  const subtitle =
    planId && planNameParam
      ? String(planNameParam)
      : "Everyone subscribed to your membership plans";

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Members" showBack subtitle={subtitle} />

      <View style={twStyle("mb-3")}>
        <FilterChipGroup
          options={STATUS_CHIPS}
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
          title="No members"
          description={
            statusFilter !== "all"
              ? "Try another status filter."
              : "When clients buy a plan, they appear here."
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
                  <View style={twStyle("ml-3 flex-1")}>
                    <Text style={twStyle("text-base font-semibold text-gray-900")} numberOfLines={1}>
                      {item.user.full_name ?? "Customer"}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")} numberOfLines={1}>
                      {item.plan.name}
                      {item.plan.price_monthly != null && item.plan.currency
                        ? ` · ${formatCurrency(item.plan.price_monthly)}/mo`
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
                      <Text style={twStyle("text-xs text-green-700")}>Auto-renews</Text>
                    )}
                    {!item.subscription.auto_renew && st === "active" && (
                      <Text style={twStyle("text-xs text-gray-400")}>Auto-renew off</Text>
                    )}
                    {item.subscription.next_billing_at && (
                      <Text style={twStyle("text-xs text-gray-500")}>
                        Next billing: {formatDate(item.subscription.next_billing_at)}
                      </Text>
                    )}
                    {item.subscription.last_payment_at && (
                      <Text style={twStyle("text-xs text-gray-400")}>
                        Last paid: {formatDate(item.subscription.last_payment_at)}
                      </Text>
                    )}
                  </View>
                )}
                <View style={twStyle("mt-2 flex-row flex-wrap")}>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    Started {formatDate(item.subscription.started_at)}
                  </Text>
                  <Text style={twStyle("mx-2 text-xs text-gray-300")}>·</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {item.subscription.expires_at
                      ? `Renews / ends ${formatDateTime(item.subscription.expires_at)}`
                      : "No expiry set"}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <BottomSheet visible={!!manageRow} onClose={closeManage} title="Manage membership">
        {manageRow && (
          <View>
            <Text style={twStyle("mb-2 text-sm text-gray-600")}>
              {manageRow.user.full_name ?? "Customer"} · {manageRow.plan.name}
            </Text>

            <Text style={twStyle("mb-1 text-xs font-semibold uppercase text-gray-400")}>
              Expiry (optional)
            </Text>
            <TextInput
              style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
              placeholder="YYYY-MM-DDTHH:mm (ISO local)"
              placeholderTextColor="#9ca3af"
              value={extendIso}
              onChangeText={setExtendIso}
              autoCapitalize="none"
            />
            <View style={twStyle("mb-4 flex-row flex-wrap gap-2")}>
              {[
                { label: "+7 days", days: 7 },
                { label: "+30 days", days: 30 },
                { label: "+90 days", days: 90 },
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
              label="Save expiry"
              onPress={onSaveExpiry}
              loading={patchLoading}
              fullWidth
            />

            {manageRow.subscription.status === "active" ? (
              <TouchableOpacity
                style={twStyle("mt-3 items-center rounded-xl bg-red-50 py-3")}
                onPress={() => onCancel(manageRow)}
              >
                <Text style={twStyle("text-sm font-semibold text-red-700")}>Cancel membership</Text>
              </TouchableOpacity>
            ) : manageRow.subscription.status === "cancelled" ? (
              <>
                <ActionButton
                  label={winBackLoading ? "Sending…" : "Send win-back offer"}
                  onPress={() => void onSendWinBack()}
                  loading={winBackLoading}
                  fullWidth
                  style={{ marginTop: 12 }}
                />
                <TouchableOpacity
                  style={twStyle("mt-3 items-center rounded-xl bg-green-50 py-3")}
                  onPress={() => onReactivate(manageRow)}
                >
                  <Text style={twStyle("text-sm font-semibold text-green-800")}>Mark active again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={twStyle("mt-3 items-center rounded-xl bg-green-50 py-3")}
                onPress={() => onReactivate(manageRow)}
              >
                <Text style={twStyle("text-sm font-semibold text-green-800")}>Mark active again</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
