/**
 * Native My Earnings – pay stubs and earnings history for staff.
 * Full parity with web: list of pay stubs, expand for details.
 */
import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
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

interface PayStub {
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
}

export default function MyEarningsScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const currency = getTenantDefaultCurrency();

  const { data, loading, error, refresh } = useApi<PayStub[] | { data?: PayStub[] }>(
    "/api/provider/pay-runs/my-earnings"
  );

  const payStubs: PayStub[] = Array.isArray(data) ? data : (data as { data?: PayStub[] })?.data ?? [];

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
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="My earnings" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !payStubs.length) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="My earnings" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="My earnings"
        subtitle="Your pay stubs and earnings history"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {payStubs.length === 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-8 items-center mt-4")}>
            <Ionicons name="wallet-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-base font-semibold text-gray-900 text-center")}>
              No pay stubs yet
            </Text>
            <Text style={twStyle("mt-2 text-sm text-gray-500 text-center")}>
              When your employer runs payroll, your pay stubs will appear here.
            </Text>
          </View>
        ) : (
          payStubs.map((stub) => {
            const isExpanded = expandedId === stub.pay_run_id;
            const deductions =
              Number(stub.manual_deductions) +
              Number(stub.tax_deduction) +
              Number(stub.uif_contribution);

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
                      Net: {currency} {Number(stub.net_pay).toFixed(2)}
                    </Text>
                  </View>
                  <View style={twStyle("flex-row items-center gap-2")}>
                    <View style={[twStyle("rounded-full px-2.5 py-1"), statusStyle(stub.status)]}>
                      <Text style={twStyle("text-xs font-medium capitalize")}>{stub.status}</Text>
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
                      <Row label="Gross pay" value={`${currency} ${Number(stub.gross_pay).toFixed(2)}`} />
                      <Row label="Commission" value={`${currency} ${Number(stub.commission_amount).toFixed(2)}`} />
                      <Row label="Hourly" value={`${currency} ${Number(stub.hourly_amount).toFixed(2)}`} />
                      <Row label="Salary" value={`${currency} ${Number(stub.salary_amount).toFixed(2)}`} />
                      <Row label="Tips" value={`${currency} ${Number(stub.tips_amount).toFixed(2)}`} />
                      <View style={twStyle("flex-row justify-between py-1")}>
                        <Text style={twStyle("text-sm text-red-600")}>
                          Deductions (Tax, UIF, Other)
                        </Text>
                        <Text style={twStyle("text-sm font-medium text-red-600")}>
                          -{currency} {deductions.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                    <View style={twStyle("flex-row justify-between pt-3 mt-2 border-t border-gray-200")}>
                      <Text style={twStyle("font-semibold text-gray-900")}>Net pay</Text>
                      <Text style={twStyle("font-semibold text-gray-900")}>
                        {currency} {Number(stub.net_pay).toFixed(2)}
                      </Text>
                    </View>
                    {stub.notes && (
                      <Text style={twStyle("text-xs text-gray-500 mt-2")}>{stub.notes}</Text>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={twStyle("flex-row justify-between py-0.5")}>
      <Text style={twStyle("text-sm text-gray-600")}>{label}</Text>
      <Text style={twStyle("text-sm text-gray-900")}>{value}</Text>
    </View>
  );
}
