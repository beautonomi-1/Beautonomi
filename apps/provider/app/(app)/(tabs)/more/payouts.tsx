import { useCallback, useMemo, useState, type ComponentProps } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter, Redirect } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { useApi, useApiMutation, MONEY_SURFACE_STALE_TIME_MS, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { useFocusRevalidate } from "@/hooks/useFocusRevalidate";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";
import { PayoutReconciliationCard, type PayoutReconciliation } from "@/components/PayoutReconciliationCard";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  requested_at?: string;
  processed_at?: string | null;
  failure_reason?: string | null;
  rejected_at?: string | null;
  notes?: string | null;
}

interface PayoutAccount {
  id: string;
  account_name?: string;
  bank_name?: string;
  account_number?: string;
  account_number_last4?: string;
  active?: boolean;
  is_primary?: boolean;
}

/** GET /api/provider/team-access — payout request aligns with owner/`edit_settings`. */
interface TeamAccessPayload {
  can_process_payments?: boolean;
  can_request_payouts?: boolean;
  is_business_owner?: boolean;
}

interface NextDateData {
  payout_schedule?: string;
  minimum_payout_amount?: number;
  payout_hold_days?: number;
  next_payout_date?: string | null;
  next_payout_description?: string;
}

function formatDateSafe(value: unknown, dash = "—"): string {
  if (typeof value !== "string" || !value) return dash;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return dash;
  return parsed.toLocaleDateString();
}

type PayoutT = (key: string, opts?: Record<string, unknown>) => string;

function payoutStatusMeta(payout: Pick<Payout, "status" | "rejected_at">, po: PayoutT): {
  label: string;
  description: string;
  icon: IoniconName;
  chipBg: string;
  chipText: string;
  iconBg: string;
  iconColor: string;
} {
  const status = payout.status;
  if (status === "failed" && payout.rejected_at) {
    return {
      label: po("statusRejected"),
      description: po("statusRejectedDesc"),
      icon: "close-circle-outline",
      chipBg: "bg-orange-100",
      chipText: "text-orange-800",
      iconBg: "bg-orange-100",
      iconColor: "#ea580c",
    };
  }
  if (status === "completed") {
    return {
      label: po("statusPaid"),
      description: po("statusPaidDesc"),
      icon: "checkmark-circle-outline",
      chipBg: "bg-green-100",
      chipText: "text-green-800",
      iconBg: "bg-green-100",
      iconColor: "#16a34a",
    };
  }
  if (status === "processing") {
    return {
      label: po("statusProcessing"),
      description: po("statusProcessingDesc"),
      icon: "sync-outline",
      chipBg: "bg-blue-100",
      chipText: "text-blue-800",
      iconBg: "bg-blue-100",
      iconColor: "#2563eb",
    };
  }
  if (status === "failed") {
    return {
      label: po("statusFailed"),
      description: po("statusFailedDesc"),
      icon: "alert-circle-outline",
      chipBg: "bg-red-100",
      chipText: "text-red-800",
      iconBg: "bg-red-100",
      iconColor: "#dc2626",
    };
  }
  return {
    label: po("statusPending"),
    description: po("statusPendingDesc"),
    icon: "time-outline",
    chipBg: "bg-amber-100",
    chipText: "text-amber-800",
    iconBg: "bg-amber-100",
    iconColor: "#d97706",
  };
}

function formatAccountLabel(account: PayoutAccount | undefined, po: PayoutT): string {
  if (!account) return po("primaryPayoutAccount");
  const last4 = account.account_number_last4 ?? String(account.account_number ?? "").slice(-4);
  const suffix = last4 ? ` ****${last4}` : "";
  return `${account.account_name ?? po("bankAccount")}${account.bank_name ? ` (${account.bank_name}${suffix})` : suffix}`;
}

function confirmPayoutRequest(params: {
  amount: string;
  account: string;
  available: string;
  pending: string;
  schedule?: string;
  po: PayoutT;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const { po } = params;
    Alert.alert(
      po("confirmTitle"),
      po("confirmBody", {
        amount: params.amount,
        account: params.account,
        available: params.available,
        pending: params.pending,
        scheduleLine: params.schedule ? po("confirmScheduleLine", { schedule: params.schedule }) : "",
      }),
      [
        { text: po("cancel"), style: "cancel", onPress: () => resolve(false) },
        { text: po("submitRequest"), onPress: () => resolve(true) },
      ],
    );
  });
}

/** Content-only for use in Finance hub (Payouts tab). */
export function PayoutsContent() {
  const { t } = useTranslation();
  const po = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.payouts." + key, opts) as string,
    [t],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);

  const { data: payoutsList, loading, error, refresh, silentRefresh } = useApi<Payout[]>(
    "/api/provider/payouts",
    {
      staleTimeMs: MONEY_SURFACE_STALE_TIME_MS,
      timeoutMs: MONEY_SURFACE_TIMEOUT_MS,
      revalidateOnFocus: true,
    },
  );
  useFocusRevalidate(silentRefresh);
  const { data: accountsList, refresh: refreshAccounts } = useApi<PayoutAccount[]>("/api/provider/payout-accounts", {
    revalidateOnFocus: true,
  });
  const { data: teamAccess } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const { data: nextDate, refresh: refreshNextDate } = useApi<NextDateData>("/api/provider/payouts/next-date", {
    revalidateOnFocus: true,
  });
  const { data: financeData, refresh: refreshFinance } = useApi<{
    earnings?: {
      available_balance?: number;
      pending_payouts?: number;
      minimum_payout_amount?: number;
      payout_hold_days?: number;
      payout_balance_unavailable?: boolean;
      payout_reconciliation?: PayoutReconciliation;
    };
  }>("/api/provider/finance?range=month", { timeoutMs: MONEY_SURFACE_TIMEOUT_MS });
  const { execute: postPayout, loading: requesting } = useApiMutation<Payout>("post");

  const payouts: Payout[] = useMemo(() => (Array.isArray(payoutsList) ? payoutsList : []), [payoutsList]);
  const accounts: PayoutAccount[] = useMemo(() => (Array.isArray(accountsList) ? accountsList : []), [accountsList]);
  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.active !== false),
    [accounts],
  );
  const preferredAccount = useMemo(
    () =>
      activeAccounts.find((account) => account.id === bankAccountId) ??
      activeAccounts.find((account) => account.is_primary) ??
      activeAccounts[0],
    [activeAccounts, bankAccountId],
  );
  const availableBalance = financeData?.earnings?.available_balance ?? 0;
  const payoutBalanceUnavailable = financeData?.earnings?.payout_balance_unavailable === true;
  const pendingPayouts = financeData?.earnings?.pending_payouts ?? 0;
  const minimumPayout = financeData?.earnings?.minimum_payout_amount;
  const defaultCurrency = getTenantDefaultCurrency();

  const canRequestPayouts =
    teamAccess?.can_request_payouts === true || teamAccess?.is_business_owner === true;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshFinance(), refreshAccounts(), refreshNextDate()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshFinance, refreshAccounts, refreshNextDate]);

  const handleRequestPayout = useCallback(async () => {
    const raw = parseFloat(amount.replace(/,/g, "."));
    const num = Math.round((raw + Number.EPSILON) * 100) / 100;
    if (Number.isNaN(raw) || Number.isNaN(num) || num <= 0) {
      Alert.alert(po("invalidAmountTitle"), po("invalidAmountBody"));
      return;
    }
    // §Provider-audit 2026-04 (round 5): pre-validate against minimum and
    // available balance so providers get immediate feedback instead of a
    // round-trip 400. Server-side checks in POST /api/provider/payouts
    // remain authoritative (guards against stale UI balance).
    if (minimumPayout != null && num < minimumPayout) {
      Alert.alert(
        po("belowMinimumTitle"),
        po("belowMinimumBody", { amount: formatCurrency(minimumPayout, defaultCurrency) }),
      );
      return;
    }
    if (payoutBalanceUnavailable) {
      Alert.alert(po("balanceUnavailableTitle"), po("balanceUnavailableBody"));
      return;
    }
    if (num > Math.round((availableBalance + Number.EPSILON) * 100) / 100 + 1e-6) {
      Alert.alert(
        po("insufficientTitle"),
        po("insufficientBody", {
          available: formatCurrency(availableBalance, defaultCurrency),
          requested: formatCurrency(num, defaultCurrency),
        }),
      );
      return;
    }
    const selectedAccount = preferredAccount;
    if (!selectedAccount) {
      Alert.alert(po("bankRequiredTitle"), po("bankRequiredBody"));
      return;
    }
    const scheduleLabel = nextDate?.next_payout_date
      ? po("scheduleNextRun", { schedule: nextDate.payout_schedule ?? po("weekly"), date: formatDateSafe(nextDate.next_payout_date, po("dash")) })
      : nextDate?.payout_schedule;
    const confirmed = await confirmPayoutRequest({
      amount: formatCurrency(num, defaultCurrency),
      account: formatAccountLabel(selectedAccount, po),
      available: formatCurrency(Math.max(0, availableBalance - num), defaultCurrency),
      pending: formatCurrency(pendingPayouts, defaultCurrency),
      schedule: scheduleLabel,
      po,
    });
    if (!confirmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = {
      amount: num,
      notes: notes.trim() || undefined,
      bank_account_id: selectedAccount.id,
    };
    const { error: err } = await postPayout("/api/provider/payouts", body);
    if (err) {
      Alert.alert(po("errorTitle"), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRequestOpen(false);
    setAmount("");
    setNotes("");
    setBankAccountId(null);
    refresh();
    refreshFinance();
    refreshAccounts();
    refreshNextDate();
  }, [
    amount,
    notes,
    preferredAccount,
    postPayout,
    refresh,
    refreshFinance,
    refreshAccounts,
    refreshNextDate,
    minimumPayout,
    availableBalance,
    payoutBalanceUnavailable,
    pendingPayouts,
    defaultCurrency,
    nextDate,
    po,
  ]);

  if (loading && !payoutsList) {
    return (
      <View style={twStyle("flex-1 px-4 py-6")}>
        <SkeletonList rows={5} />
      </View>
    );
  }
  if (error && !payoutsList) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >

        {!canRequestPayouts && teamAccess != null && (
          <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3")}>
            <Text style={twStyle("text-sm text-amber-900")}>
              {po("permissionBanner")}
            </Text>
          </View>
        )}
        <View style={twStyle("mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4")}>
          <Text style={twStyle("text-sm text-emerald-700 mb-1")}>{po("availableToWithdraw")}</Text>
          <Text style={twStyle("text-2xl font-bold text-emerald-900")}>
            {payoutBalanceUnavailable ? po("dash") : formatCurrency(availableBalance, defaultCurrency)}
          </Text>
          {payoutBalanceUnavailable ? (
            <Text style={twStyle("text-xs text-amber-700 mt-1")}>
              {po("balanceLoading")}
            </Text>
          ) : pendingPayouts > 0 ? (
            <Text style={twStyle("text-xs text-amber-700 mt-1")}>
              {po("pendingPayout", { amount: formatCurrency(pendingPayouts, defaultCurrency) })}
            </Text>
          ) : null}
          <Text style={twStyle("text-xs text-gray-500 mt-1")}>
            {po("minimumPayout", { amount: minimumPayout != null ? formatCurrency(minimumPayout, defaultCurrency) : po("dash") })}
          </Text>
          <Text style={twStyle("text-xs text-gray-500 mt-1")}>
            {po("balanceHint")}
          </Text>
        </View>

        {financeData?.earnings?.payout_reconciliation ? (
          <PayoutReconciliationCard
            reconciliation={financeData.earnings.payout_reconciliation}
            currency={defaultCurrency}
            payoutHoldDays={financeData.earnings.payout_hold_days}
          />
        ) : null}
        <View style={twStyle("mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4")}>
          <View style={twStyle("flex-row items-start")}>
            <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-xl bg-blue-100")}>
              <Ionicons name="calendar-outline" size={20} color="#2563eb" />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-semibold text-blue-950")}>
                {nextDate?.payout_schedule ? po("payoutScheduleNamed", { schedule: nextDate.payout_schedule }) : po("payoutSchedule")}
              </Text>
              <Text style={twStyle("mt-1 text-xs leading-5 text-blue-800")}>
                {nextDate?.next_payout_description ?? po("scheduleFallback")}
              </Text>
              <View style={twStyle("mt-2 flex-row flex-wrap")}>
                {nextDate?.next_payout_date ? (
                  <Text style={twStyle("me-3 text-xs font-medium text-blue-900")}>
                    {po("nextRun", { date: formatDateSafe(nextDate.next_payout_date, po("dash")) })}
                  </Text>
                ) : null}
                {(nextDate?.payout_hold_days ?? 0) > 0 ? (
                  <Text style={twStyle("text-xs font-medium text-amber-800")}>
                    {po("holdDays", { count: nextDate?.payout_hold_days })}
                  </Text>
                ) : (
                  <Text style={twStyle("text-xs font-medium text-blue-900")}>
                    {po("noHold")}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {payouts.length === 0 ? (
          <View style={twStyle("items-center py-16")}>
            <View style={twStyle("mb-4 h-16 w-16 items-center justify-center rounded-full bg-emerald-100")}>
              <Ionicons name="wallet-outline" size={32} color="#059669" />
            </View>
            <Text style={twStyle("text-center font-semibold text-gray-900")}>{po("emptyTitle")}</Text>
            <Text style={twStyle("mt-1 text-center text-sm text-gray-500")}>
              {po("emptyDesc")}
            </Text>
            {canRequestPayouts ? (
              <TouchableOpacity
                onPress={() => {
                  if (activeAccounts.length === 0) {
                    router.push("/(app)/(tabs)/more/settings/payout-accounts");
                    return;
                  }
                  setRequestOpen(true);
                }}
                style={twStyle("mt-6 flex-row items-center justify-center rounded-xl bg-emerald-600 px-6 py-3")}
              >
                <Ionicons name="cash-outline" size={20} color="#fff" />
                <Text style={twStyle("ms-2 font-medium text-white")}>
                  {activeAccounts.length === 0 ? po("addBankAccount") : po("requestPayout")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => {
                setAmount("");
                setNotes("");
                setBankAccountId(null);
                if (!canRequestPayouts) {
                  Alert.alert(
                    po("permissionRequiredTitle"),
                    po("permissionRequiredBody"),
                  );
                  return;
                }
                if (activeAccounts.length === 0) {
                  router.push("/(app)/(tabs)/more/settings/payout-accounts");
                } else {
                  setRequestOpen(true);
                }
              }}
              style={twStyle("mb-3 flex-row items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 py-3")}
            >
              <Ionicons name="cash-outline" size={18} color="#059669" />
              <Text style={twStyle("ms-2 font-medium text-emerald-700")}>{po("requestPayout")}</Text>
            </TouchableOpacity>
            {payouts.map((p) => {
              const meta = payoutStatusMeta(p, po);
              return (
                <View
                  key={p.id}
                  style={twStyle("mb-3 rounded-2xl border border-gray-200 bg-white p-4")}
                >
                  <View style={twStyle("flex-row items-start")}>
                    <View style={twStyle(`h-10 w-10 items-center justify-center rounded-xl ${meta.iconBg}`)}>
                      <Ionicons name={meta.icon} size={20} color={meta.iconColor} />
                    </View>
                    <View style={twStyle("ms-3 flex-1")}>
                      <View style={twStyle("flex-row items-start justify-between")}>
                        <View style={twStyle("flex-1")}>
                          <Text style={twStyle("font-semibold text-gray-900")}>
                            {formatCurrency(p.amount, p.currency || defaultCurrency)}
                          </Text>
                          <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                            {po("requested", { date: formatDateSafe(p.requested_at ?? p.created_at, po("dash")) })}
                          </Text>
                        </View>
                        <View style={twStyle(`rounded-full px-2.5 py-1 ${meta.chipBg}`)}>
                          <Text style={twStyle(`text-xs font-semibold ${meta.chipText}`)}>
                            {meta.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={twStyle("mt-2 text-xs leading-5 text-gray-600")}>
                        {p.status === "failed" && p.failure_reason
                          ? po("reason", { reason: p.failure_reason })
                          : meta.description}
                      </Text>
                      {p.processed_at ? (
                        <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                          {po("updated", { date: formatDateSafe(p.processed_at, po("dash")) })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={requestOpen && canRequestPayouts}
        onClose={() => setRequestOpen(false)}
        title={po("sheetTitle")}
        subtitle={po("sheetSubtitle")}
      >
        <Text style={twStyle("mb-1 text-sm text-emerald-700")}>
          {po("availableAmount", { amount: formatCurrency(availableBalance, defaultCurrency) })}
        </Text>
        <View style={twStyle("mb-2 flex-row items-center justify-between")}>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>
            {po("amountLabel", { currency: defaultCurrency })}
          </Text>
          {availableBalance > 0 && (
            <TouchableOpacity
              onPress={() => setAmount(availableBalance.toFixed(2))}
              style={twStyle("rounded-full bg-emerald-50 px-3 py-1 border border-emerald-200")}
            >
              <Text style={twStyle("text-xs font-semibold text-emerald-700")}>{po("max")}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder={po("amountPlaceholder")}
          placeholderTextColor="#9ca3af"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
        <Text style={twStyle("mb-4 text-xs text-gray-500")}>
          {minimumPayout != null
            ? po("amountHintMin", { min: formatCurrency(minimumPayout, defaultCurrency), available: formatCurrency(availableBalance, defaultCurrency), pending: formatCurrency(pendingPayouts, defaultCurrency) })
            : po("amountHint", { available: formatCurrency(availableBalance, defaultCurrency), pending: formatCurrency(pendingPayouts, defaultCurrency) })}
        </Text>
        {activeAccounts.length > 0 ? (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{po("bankAccountLabel")}</Text>
            <ScrollView style={twStyle("mb-4 max-h-32")} nestedScrollEnabled>
              {activeAccounts.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => setBankAccountId(bankAccountId === a.id ? null : a.id)}
                  style={twStyle(`mb-2 rounded-xl border px-4 py-3 ${preferredAccount?.id === a.id ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-gray-50"}`)}
                >
                  <Text style={twStyle("font-medium text-gray-900")}>{a.account_name ?? po("bankAccount")}</Text>
                  {(a.account_number_last4 || a.account_number || a.bank_name) && (
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {a.bank_name ? `${a.bank_name} · ` : ""}
                      ****{a.account_number_last4 ?? String(a.account_number ?? "").slice(-4)}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setRequestOpen(false);
              router.push("/(app)/(tabs)/more/settings/payout-accounts");
            }}
            style={twStyle("mb-4 flex-row items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-3")}
          >
            <Ionicons name="card-outline" size={18} color="#b45309" />
            <Text style={twStyle("ms-2 flex-1 text-sm font-medium text-amber-900")}>
              {po("addBankBeforeRequest")}
            </Text>
            <DirectionalIcon name="chevron-forward" size={16} color="#b45309" />
          </TouchableOpacity>
        )}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{po("notesOptional")}</Text>
        <TextInput
          style={twStyle("mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder={po("notesPlaceholder")}
          placeholderTextColor="#9ca3af"
          value={notes}
          onChangeText={setNotes}
        />
        <ActionButton
          label={requesting ? po("submitting") : po("requestPayout")}
          onPress={handleRequestPayout}
          loading={requesting}
          disabled={activeAccounts.length === 0}
          fullWidth
        />
      </BottomSheet>
    </>
  );
}

export default function PayoutsScreen() {
  return <Redirect href="/(app)/(tabs)/more/money?tab=payouts" />;
}
