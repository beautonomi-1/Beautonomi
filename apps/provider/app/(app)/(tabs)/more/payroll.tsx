import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { useRouter, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import {
  boundsForPayPeriodPreset,
  type PayPeriodTypePreset,
} from "@/lib/pay-period-presets";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { useTranslation } from "@beautonomi/i18n";
import { twStyle } from "@/lib/twStyle";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface PayRun {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  created_at: string;
  approved_at: string | null;
}

function formatDateSafe(value: unknown, empty = "—"): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return empty;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PayrollContent({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const pr = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.payroll.${key}`, opts) as string;
  const statusLabel = (status: string) =>
    status === "draft"
      ? pr("statusDraft")
      : status === "approved"
        ? pr("statusApproved")
        : status === "paid"
          ? pr("statusPaid")
          : status;
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const { role } = useProvider();
  const { data: teamAccess } = useApi<{ can_manage_payroll?: boolean }>(
    "/api/provider/team-access",
    { staleTimeMs: 60_000 },
  );
  const canManagePayroll =
    teamAccess?.can_manage_payroll === true;
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!canManagePayroll && createOpen) setCreateOpen(false);
  }, [canManagePayroll, createOpen]);
  const [periodType, setPeriodType] = useState<PayPeriodTypePreset>("weekly");
  const [periodDate, setPeriodDate] = useState(() => new Date());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customEndPicker, setCustomEndPicker] = useState(false);

  useEffect(() => {
    if (periodType === "custom") return;
    const bounds = boundsForPayPeriodPreset(periodType, periodDate);
    setPeriodStart(bounds.start);
    setPeriodEnd(bounds.end);
  }, [periodType, periodDate]);

  const { data, loading, error: loadError, refresh } = useApi<PayRun[]>("/api/provider/pay-runs");
  const { execute: approveRun } = useApiMutation("post");
  const { execute: markPaidRun } = useApiMutation("post");
  const { execute: createPayRun, loading: creating } = useApiMutation("post");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const payRuns: PayRun[] = Array.isArray(data) ? data : [];

  const handleApprove = useCallback(
    (run: PayRun) => {
      if (run.status !== "draft") return;
      Alert.alert(
        pr("approveTitle"),
        pr("approveBody"),
        [
          { text: pr("cancel"), style: "cancel" },
          {
            text: pr("approve"),
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error: err } = await approveRun(`/api/provider/pay-runs/${run.id}/approve`, {});
              if (err) {
                Alert.alert(pr("errorTitle"), err);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            },
          },
        ]
      );
    },
    [approveRun, refresh, t]
  );

  const handleMarkPaid = useCallback(
    (run: PayRun) => {
      if (run.status !== "approved") return;
      Alert.alert(
        pr("markPaidTitle"),
        pr("markPaidBody"),
        [
          { text: pr("cancel"), style: "cancel" },
          {
            text: pr("markPaid"),
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error: err } = await markPaidRun(`/api/provider/pay-runs/${run.id}/mark-paid`, {});
              if (err) {
                Alert.alert(pr("errorTitle"), err);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            },
          },
        ]
      );
    },
    [markPaidRun, refresh, t]
  );

  const formatDate = (d: string) =>
    formatDateSafe(d, pr("emptyValue"));

  const getPeriodBounds = useCallback(() => {
    if (periodType === "custom") {
      return { start: periodStart, end: periodEnd };
    }
    return boundsForPayPeriodPreset(periodType, periodDate);
  }, [periodType, periodDate, periodStart, periodEnd]);

  const handleCreatePayRun = useCallback(async () => {
    const { start, end } = getPeriodBounds();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await createPayRun("/api/provider/pay-runs", {
      pay_period_start: start,
      pay_period_end: end,
      period_type: periodType,
    });
    if (err) {
      Alert.alert(pr("errorTitle"), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreateOpen(false);
    refresh();
  }, [getPeriodBounds, periodType, createPayRun, refresh, t]);

  const periodLabel =
    periodStart && periodEnd
      ? `${format(new Date(periodStart + "T12:00:00"), "MMM d, yyyy")} – ${format(new Date(periodEnd + "T12:00:00"), "MMM d, yyyy")}`
      : pr("emptyValue");

  if (loading && !data && !loadError) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }

  if (loadError && !data) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={loadError} onRetry={refresh} />
      </View>
    );
  }

  const listBody = (
    <>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 rounded-2xl bg-emerald-50/80 p-4")}>
          <Text style={twStyle("text-sm font-medium text-emerald-900")}>{pr("sectionTitle")}</Text>
          <Text style={twStyle("mt-1 text-sm text-emerald-800")}>
            {canManagePayroll ? pr("ownerHint") : pr("staffHint")}
          </Text>
        </View>
        {payRuns.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title={pr("emptyTitle")}
            description={canManagePayroll ? pr("emptyOwner") : pr("emptyStaff")}
            actionLabel={canManagePayroll ? pr("createPayRun") : undefined}
            onAction={
              canManagePayroll
                ? () => {
                    setPeriodDate(new Date());
                    setPeriodType("weekly");
                    setCreateOpen(true);
                  }
                : undefined
            }
          />
        ) : (
          payRuns.map((run) => (
            <TouchableOpacity
              key={run.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/(app)/(tabs)/more/pay-runs/${run.id}` as never);
              }}
              activeOpacity={0.8}
              style={twStyle("mb-3 rounded-2xl border border-gray-200 bg-white p-4")}
              accessibilityRole="button"
              accessibilityLabel={pr("openPayRunA11y", {
                start: formatDate(run.pay_period_start),
                end: formatDate(run.pay_period_end),
                status: statusLabel(run.status),
              })}
            >
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("font-semibold text-gray-900")}>
                    {formatDate(run.pay_period_start)} – {formatDate(run.pay_period_end)}
                  </Text>
                  <View
                    style={twStyle(`mt-2 self-start rounded-full px-2.5 py-1 ${
                      run.status === "paid"
                        ? "bg-gray-100"
                        : run.status === "approved"
                          ? "bg-amber-100"
                          : "bg-blue-100"
                    }`)}
                  >
                    <Text
                      style={twStyle(`text-xs font-medium ${
                        run.status === "paid"
                          ? "text-gray-700"
                          : run.status === "approved"
                            ? "text-amber-800"
                            : "text-blue-800"
                      }`)}
                    >
                      {statusLabel(run.status)}
                    </Text>
                  </View>
                </View>
                <DirectionalIcon name="chevron-forward" size={20} color="#9ca3af" />
              </View>
              {run.status === "draft" && canManagePayroll && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleApprove(run);
                  }}
                  style={twStyle("mt-3 flex-row items-center justify-center rounded-xl bg-emerald-600 py-2.5")}
                  accessibilityRole="button"
                  accessibilityLabel={pr("approveA11y")}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={twStyle("ms-2 text-sm font-semibold text-white")}>{pr("approve")}</Text>
                </TouchableOpacity>
              )}
              {run.status === "approved" && canManagePayroll && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleMarkPaid(run);
                  }}
                  style={twStyle("mt-3 flex-row items-center justify-center rounded-xl bg-gray-800 py-2.5")}
                  accessibilityRole="button"
                  accessibilityLabel={pr("markPaidA11y")}
                >
                  <Ionicons name="cash-outline" size={18} color="#fff" />
                  <Text style={twStyle("ms-2 text-sm font-semibold text-white")}>{pr("markAsPaid")}</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={createOpen && canManagePayroll}
        onClose={() => !creating && setCreateOpen(false)}
        title={pr("createTitle")}
        subtitle={pr("createSubtitle")}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-3")}>
          <View style={twStyle("flex-row")}>
            <TouchableOpacity
              key="weekly"
              onPress={() => setPeriodType("weekly")}
              style={[twStyle(`rounded-xl py-2.5 px-4 ${periodType === "weekly" ? "bg-emerald-600" : "bg-gray-100"}`), { marginEnd: 8 }]}
            >
              <Text style={twStyle(`text-sm font-medium ${periodType === "weekly" ? "text-white" : "text-gray-700"}`)}>
                {pr("weekly")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              key="biweekly"
              onPress={() => setPeriodType("biweekly")}
              style={[twStyle(`rounded-xl py-2.5 px-4 ${periodType === "biweekly" ? "bg-emerald-600" : "bg-gray-100"}`), { marginEnd: 8 }]}
            >
              <Text style={twStyle(`text-sm font-medium ${periodType === "biweekly" ? "text-white" : "text-gray-700"}`)}>
                {pr("biweekly")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              key="semi_monthly"
              onPress={() => setPeriodType("semi_monthly")}
              style={[twStyle(`rounded-xl py-2.5 px-4 ${periodType === "semi_monthly" ? "bg-emerald-600" : "bg-gray-100"}`), { marginEnd: 8 }]}
            >
              <Text style={twStyle(`text-sm font-medium ${periodType === "semi_monthly" ? "text-white" : "text-gray-700"}`)}>
                {pr("semiMonthly")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              key="monthly"
              onPress={() => setPeriodType("monthly")}
              style={[twStyle(`rounded-xl py-2.5 px-4 ${periodType === "monthly" ? "bg-emerald-600" : "bg-gray-100"}`), { marginEnd: 8 }]}
            >
              <Text style={twStyle(`text-sm font-medium ${periodType === "monthly" ? "text-white" : "text-gray-700"}`)}>
                {pr("monthly")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              key="custom"
              onPress={() => setPeriodType("custom")}
              style={[twStyle(`rounded-xl py-2.5 px-4 ${periodType === "custom" ? "bg-emerald-600" : "bg-gray-100"}`), { marginEnd: 8 }]}
            >
              <Text style={twStyle(`text-sm font-medium ${periodType === "custom" ? "text-white" : "text-gray-700"}`)}>
                {pr("custom")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <Text style={twStyle("mb-1 text-xs text-gray-500")}>{pr("periodRangeLabel")}</Text>
        <Text style={twStyle("mb-3 text-base font-medium text-gray-900")}>{periodLabel}</Text>
        {periodType === "custom" ? (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{pr("periodStart")}</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
            >
              <Text style={twStyle("text-base text-gray-900")}>{periodStart || pr("emptyValue")}</Text>
            </TouchableOpacity>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{pr("periodEnd")}</Text>
            <TouchableOpacity
              onPress={() => setCustomEndPicker(true)}
              style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
            >
              <Text style={twStyle("text-base text-gray-900")}>{periodEnd || pr("emptyValue")}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          >
            <Text style={twStyle("text-base text-gray-900")}>
              {periodType === "monthly" ? pr("month") : pr("periodEndDate")}: {format(periodDate, "MMM d, yyyy")}
            </Text>
          </TouchableOpacity>
        )}
        {showDatePicker && (
          <DateTimePicker
            value={periodDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setShowDatePicker(Platform.OS === "ios");
              if (!d) return;
              if (periodType === "custom") {
                setPeriodStart(format(d, "yyyy-MM-dd"));
              } else {
                setPeriodDate(d);
              }
            }}
          />
        )}
        {customEndPicker && (
          <DateTimePicker
            value={periodEnd ? new Date(periodEnd + "T12:00:00") : periodDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              setCustomEndPicker(Platform.OS === "ios");
              if (d) setPeriodEnd(format(d, "yyyy-MM-dd"));
            }}
          />
        )}
        <ActionButton
          label={creating ? pr("creating") : pr("createPayRun")}
          onPress={handleCreatePayRun}
          loading={creating}
          fullWidth
        />
      </BottomSheet>
    </>
  );

  const newRunButton = canManagePayroll ? (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setPeriodDate(new Date());
        setPeriodType("weekly");
        setCreateOpen(true);
      }}
      style={twStyle("flex-row items-center rounded-xl bg-emerald-600 px-4 py-2")}
    >
      <Ionicons name="add" size={18} color="#fff" />
      <Text style={twStyle("ms-1.5 text-sm font-semibold text-white")}>{pr("newRun")}</Text>
    </TouchableOpacity>
  ) : null;

  if (embedded) {
    return (
      <View style={twStyle("flex-1")}>
        {newRunButton ? <View style={twStyle("mb-2 flex-row justify-end px-4")}>{newRunButton}</View> : null}
        {listBody}
      </View>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={pr("title")}
        showBack
        subtitle={pr("payRunCount", { count: payRuns.length })}
        rightAction={newRunButton}
      />
      {listBody}
    </ScreenContainer>
  );
}

export default function PayrollScreen() {
  return <Redirect href="/(app)/(tabs)/more/team-pay?tab=payroll" />;
}
