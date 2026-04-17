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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
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
import { twStyle } from "@/lib/twStyle";

interface PayRun {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  created_at: string;
  approved_at: string | null;
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isPayrollOwnerRole(role: string | null): boolean {
  return role === "provider_owner" || role === "superadmin";
}

export default function PayrollScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const { role } = useProvider();
  const isOwner = isPayrollOwnerRole(role);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!isOwner && createOpen) setCreateOpen(false);
  }, [isOwner, createOpen]);
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("weekly");
  const [periodDate, setPeriodDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

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
        "Approve pay run?",
        "This will lock the pay run for payment. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Approve",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error: err } = await approveRun(`/api/provider/pay-runs/${run.id}/approve`);
              if (err) {
                Alert.alert("Error", err);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            },
          },
        ]
      );
    },
    [approveRun, refresh]
  );

  const handleMarkPaid = useCallback(
    (run: PayRun) => {
      if (run.status !== "approved") return;
      Alert.alert(
        "Mark as paid?",
        "Confirm that this pay run has been paid out to staff.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark paid",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error: err } = await markPaidRun(`/api/provider/pay-runs/${run.id}/mark-paid`);
              if (err) {
                Alert.alert("Error", err);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            },
          },
        ]
      );
    },
    [markPaidRun, refresh]
  );

  const formatDate = (d: string) =>
    formatDateSafe(d);

  const getPeriodBounds = useCallback(() => {
    if (periodType === "monthly") {
      const start = startOfMonth(periodDate);
      const end = endOfMonth(periodDate);
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
    }
    const end = periodDate;
    const start = subDays(end, 6);
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, [periodType, periodDate]);

  const handleCreatePayRun = useCallback(async () => {
    const { start, end } = getPeriodBounds();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await createPayRun("/api/provider/pay-runs", {
      pay_period_start: start,
      pay_period_end: end,
      period_type: periodType,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreateOpen(false);
    refresh();
  }, [getPeriodBounds, periodType, createPayRun, refresh]);

  const periodLabel =
    periodType === "monthly"
      ? format(periodDate, "MMMM yyyy")
      : `${format(subDays(periodDate, 6), "MMM d")} – ${format(periodDate, "MMM d, yyyy")}`;

  if (loading && !data && !loadError) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Payroll" showBack />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (loadError && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Payroll" showBack />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={loadError} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Payroll"
        showBack
        subtitle={`${payRuns.length} pay run${payRuns.length === 1 ? "" : "s"}`}
        rightAction={
          isOwner ? (
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
              <Text style={twStyle("ml-1.5 text-sm font-semibold text-white")}>New run</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 rounded-2xl bg-emerald-50/80 p-4")}>
          <Text style={twStyle("text-sm font-medium text-emerald-900")}>Pay runs</Text>
          <Text style={twStyle("mt-1 text-sm text-emerald-800")}>
            {isOwner
              ? "Create a run for a period, then tap a draft run to adjust per-staff PAYE, UIF, and manual deductions. Approve and mark paid when ready."
              : "View pay runs for your workplace. Only the business owner can create runs, approve, or mark them paid."}
          </Text>
        </View>
        {payRuns.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="No pay runs yet"
            description={
              isOwner
                ? "Create a pay run for a weekly or monthly period. Then approve and mark it paid here."
                : "Your owner hasn’t created a pay run yet. Ask them to start one from this screen."
            }
            actionLabel={isOwner ? "Create pay run" : undefined}
            onAction={
              isOwner
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
              accessibilityLabel={`Open pay run for ${formatDate(run.pay_period_start)} through ${formatDate(run.pay_period_end)}, status ${run.status}`}
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
                      style={twStyle(`text-xs font-medium capitalize ${
                        run.status === "paid"
                          ? "text-gray-700"
                          : run.status === "approved"
                            ? "text-amber-800"
                            : "text-blue-800"
                      }`)}
                    >
                      {run.status}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </View>
              {run.status === "draft" && isOwner && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleApprove(run);
                  }}
                  style={twStyle("mt-3 flex-row items-center justify-center rounded-xl bg-emerald-600 py-2.5")}
                  accessibilityRole="button"
                  accessibilityLabel="Approve pay run"
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={twStyle("ml-2 text-sm font-semibold text-white")}>Approve</Text>
                </TouchableOpacity>
              )}
              {run.status === "approved" && isOwner && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleMarkPaid(run);
                  }}
                  style={twStyle("mt-3 flex-row items-center justify-center rounded-xl bg-gray-800 py-2.5")}
                  accessibilityRole="button"
                  accessibilityLabel="Mark pay run as paid"
                >
                  <Ionicons name="cash-outline" size={18} color="#fff" />
                  <Text style={twStyle("ml-2 text-sm font-semibold text-white")}>Mark as paid</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={createOpen && isOwner}
        onClose={() => !creating && setCreateOpen(false)}
        title="Create pay run"
        subtitle="Choose period type and date"
      >
        <View style={twStyle("mb-4 flex-row")}>
          <TouchableOpacity
            onPress={() => setPeriodType("weekly")}
            style={[twStyle(`flex-1 rounded-xl py-3 ${periodType === "weekly" ? "bg-emerald-600" : "bg-gray-100"}`), { marginRight: 12 }]}
          >
            <Text
              style={twStyle(`text-center text-sm font-medium ${periodType === "weekly" ? "text-white" : "text-gray-700"}`)}
            >
              Weekly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPeriodType("monthly")}
            style={twStyle(`flex-1 rounded-xl py-3 ${periodType === "monthly" ? "bg-emerald-600" : "bg-gray-100"}`)}
          >
            <Text
              style={twStyle(`text-center text-sm font-medium ${periodType === "monthly" ? "text-white" : "text-gray-700"}`)}
            >
              Monthly
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
          {periodType === "monthly" ? "Month" : "Period end date"}
        </Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
        >
          <Text style={twStyle("text-base text-gray-900")}>{periodLabel}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={periodDate}
            mode={periodType === "monthly" ? "date" : "date"}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, d) => {
              setShowDatePicker(Platform.OS !== "ios");
              if (d) setPeriodDate(d);
            }}
          />
        )}
        <ActionButton
          label={creating ? "Creating…" : "Create pay run"}
          onPress={handleCreatePayRun}
          loading={creating}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
