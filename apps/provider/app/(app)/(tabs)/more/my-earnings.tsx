/**
 * Native My Earnings – pay stubs and earnings history for staff.
 * Full parity with web: list of pay stubs, expand for details.
 */
import { addMoney } from "@beautonomi/utils";
import { useCallback, useState } from "react";
import { Alert, View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useTranslation } from "@beautonomi/i18n";
import { formatCurrency } from "@/lib/format";
import { sharePayrollFile } from "@/lib/open-payroll-file";

interface PayStub {
  item_id?: string;
  pay_run_id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  created_at: string;
  gross_pay: number;
  commission_amount: number;
  hourly_amount: number;
  salary_amount: number;
  tips_amount: number;
  manual_deductions: number;
  tax_deduction: number;
  uif_contribution: number;
  net_pay: number;
  notes?: string;
  commission_clawback?: number;
  carry_forward_in?: number;
  carry_forward_out?: number;
}

export function MyEarningsContent({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const me = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.myEarnings.${key}`, opts) as string;
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const currency = getTenantDefaultCurrency();

  const { data, loading, error, refresh } = useApi<
    PayStub[] | { data?: PayStub[]; pay_stubs?: PayStub[]; live?: Record<string, { total: number; commission: number; tips: number }> }
  >("/api/provider/pay-runs/my-earnings");

  const payStubs: PayStub[] = Array.isArray(data)
    ? data
    : (data as { pay_stubs?: PayStub[]; data?: PayStub[] })?.pay_stubs ??
      (data as { data?: PayStub[] })?.data ??
      [];

  const live = !Array.isArray(data)
    ? (data as { live?: Record<string, { total: number; commission: number; tips: number; adjustments?: number }> })?.live
    : null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const statusStyle = (s: string) => {
    if (s === "draft") return twStyle("bg-amber-100 text-amber-800");
    if (s === "approved") return twStyle("bg-blue-100 text-blue-800");
    if (s === "paid") return twStyle("bg-green-100 text-green-800");
    return twStyle("bg-gray-100 text-gray-800");
  };

  if (loading && !payStubs.length) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }

  if (error && !payStubs.length) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
        {live ? (
          <View style={twStyle("rounded-2xl border border-teal-100 bg-teal-50/60 p-4 mb-4 mt-4")}>
            <Text style={twStyle("text-sm font-semibold text-teal-900 mb-2")}>{me("liveEarnings")}</Text>
            {(["today", "week", "month"] as const).map((period) => {
              const row = live[period];
              const adjustments = Number(row?.adjustments ?? 0);
              return (
                <View key={period} style={twStyle("py-1")}>
                  <View style={twStyle("flex-row justify-between")}>
                    <Text style={twStyle("text-sm text-teal-800")}>
                      {period === "today" ? me("periodToday") : period === "week" ? me("periodWeek") : me("periodMonth")}
                    </Text>
                    <Text style={twStyle("text-sm font-medium text-teal-900")}>
                      {formatCurrency(Number(row?.total ?? 0), currency)}
                    </Text>
                  </View>
                  <Text style={twStyle("text-xs text-teal-800")}>
                    {me("commissionTips", {
                      commission: formatCurrency(Number(row?.commission ?? 0), currency),
                      tips: formatCurrency(Number(row?.tips ?? 0), currency),
                      defaultValue: "Commission {{commission}} · Tips {{tips}}",
                    })}
                    {adjustments !== 0
                      ? ` · ${me("adjustments", {
                          amount: formatCurrency(adjustments, currency),
                          defaultValue: "Adjustments {{amount}}",
                        })}`
                      : ""}
                  </Text>
                </View>
              );
            })}
            <Text style={twStyle("mt-2 text-xs text-teal-800")}>
              {me("liveBasis", {
                defaultValue:
                  "Commission and tips count on the day the client pays, not the appointment day. A refund, a returned product, or a returned tip in that period comes off.",
              })}
            </Text>
          </View>
        ) : null}
        {payStubs.length === 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-8 items-center mt-4")}>
            <Ionicons name="wallet-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-base font-semibold text-gray-900 text-center")}>
              {me("emptyTitle")}
            </Text>
            <Text style={twStyle("mt-2 text-sm text-gray-500 text-center")}>
              {me("emptyDesc")}
            </Text>
          </View>
        ) : (
          payStubs.map((stub) => {
            const isExpanded = expandedId === stub.pay_run_id;
            const deductions = [stub.manual_deductions, stub.tax_deduction, stub.uif_contribution, stub.carry_forward_in].reduce<number>(
              (sum, amount) => addMoney(sum, Number(amount || 0)),
              0,
            );

            return (
              <View
                key={stub.pay_run_id}
                style={twStyle("rounded-2xl border border-gray-200 bg-white overflow-hidden mb-4")}
              >
                <TouchableOpacity
                  onPress={() => setExpandedId(isExpanded ? null : stub.pay_run_id)}
                  style={twStyle("flex-row items-center justify-between p-4")}
                  activeOpacity={0.7}
                >
                  <View>
                    <Text style={twStyle("font-semibold text-gray-900")}>
                      {format(new Date(stub.pay_period_start), "MMM d")} –{" "}
                      {format(new Date(stub.pay_period_end), "MMM d, yyyy")}
                    </Text>
                    <Text style={twStyle("text-sm text-gray-500 mt-0.5")}>
                      {me("net", { amount: formatCurrency(Number(stub.net_pay), currency) })}
                    </Text>
                  </View>
                  <View style={twStyle("flex-row items-center gap-2")}>
                    <View style={[twStyle("rounded-full px-2.5 py-1"), statusStyle(stub.status)]}>
                      <Text style={twStyle("text-xs font-medium")}>
                        {stub.status === "draft"
                          ? me("statusDraft")
                          : stub.status === "approved"
                            ? me("statusApproved")
                            : stub.status === "paid"
                              ? me("statusPaid")
                              : stub.status}
                      </Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#6b7280"
                    />
                  </View>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={twStyle("border-t border-gray-100 px-4 pb-4 pt-2")}>
                    <View style={twStyle("gap-2")}>
                      <Row label={me("grossPay")} value={formatCurrency(Number(stub.gross_pay), currency)} />
                      <Row label={me("commission")} value={formatCurrency(Number(stub.commission_amount), currency)} />
                      <Row label={me("hourly")} value={formatCurrency(Number(stub.hourly_amount), currency)} />
                      <Row label={me("salary")} value={formatCurrency(Number(stub.salary_amount), currency)} />
                      <Row label={me("tips")} value={formatCurrency(Number(stub.tips_amount), currency)} />
                      {Number(stub.commission_clawback) !== 0 ? (
                        <Row
                          label={me("clawback")}
                          value={formatCurrency(Number(stub.commission_clawback), currency)}
                        />
                      ) : null}
                      {Number(stub.carry_forward_out) !== 0 ? (
                        <Row
                          label={me("carryForwardOut")}
                          value={formatCurrency(Math.abs(Number(stub.carry_forward_out)), currency)}
                        />
                      ) : null}
                      <View style={twStyle("flex-row justify-between py-1")}>
                        <Text style={twStyle("text-sm text-red-600")}>
                          {me("totalDeductions", { defaultValue: "Total deductions" })}
                        </Text>
                        <Text style={twStyle("text-sm font-medium text-red-600")}>
                          -{formatCurrency(deductions, currency)}
                        </Text>
                      </View>
                    </View>
                    <View style={twStyle("flex-row justify-between pt-3 mt-2 border-t border-gray-200")}>
                      <Text style={twStyle("font-semibold text-gray-900")}>{me("netPay")}</Text>
                      <Text style={twStyle("font-semibold text-gray-900")}>
                        {formatCurrency(Number(stub.net_pay), currency)}
                      </Text>
                    </View>
                    {stub.notes && (
                      <Text style={twStyle("text-xs text-gray-500 mt-2")}>{stub.notes}</Text>
                    )}
                    {stub.item_id && stub.status !== "draft" ? (
                      <TouchableOpacity
                        onPress={() => {
                          void sharePayrollFile(
                            `/api/provider/pay-runs/items/${stub.item_id}/payslip`,
                            `payslip-${stub.item_id!.slice(0, 8)}.html`,
                            "text/html",
                          ).then((err) => {
                            if (err) Alert.alert(me("payslip", { defaultValue: "Payslip" }), err);
                          });
                        }}
                        style={twStyle("mt-3 self-start rounded-lg border border-gray-300 px-3 py-2")}
                        accessibilityRole="button"
                      >
                        <Text style={twStyle("text-sm font-medium text-gray-900")}>
                          {me("payslip", { defaultValue: "Payslip" })}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
  );
}

export default function MyEarningsScreen() {
  return <Redirect href="/(app)/(tabs)/more/team-pay?tab=my-earnings" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={twStyle("flex-row justify-between py-0.5")}>
      <Text style={twStyle("text-sm text-gray-600")}>{label}</Text>
      <Text style={twStyle("text-sm text-gray-900")}>{value}</Text>
    </View>
  );
}
