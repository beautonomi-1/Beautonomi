import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
} from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FinanceReportError } from "@/components/finance/FinanceReportError";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import {
  getReportDateRange,
  formatReportRangeCaption,
  type ReportDateRangeKey,
} from "@/lib/reportDateRanges";
import { appendReportLocation } from "@/lib/reportLocationQuery";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";

const DATE_RANGES: { labelKey: "rangeToday" | "rangeThisWeek" | "rangeThisMonth" | "rangeLastMonth" | "range3Months"; value: ReportDateRangeKey }[] = [
  { labelKey: "rangeToday", value: "today" },
  { labelKey: "rangeThisWeek", value: "week" },
  { labelKey: "rangeThisMonth", value: "month" },
  { labelKey: "rangeLastMonth", value: "last_month" },
  { labelKey: "range3Months", value: "3months" },
];

interface ProductItem {
  name: string;
  units_sold: number;
  revenue: number;
  current_stock?: number;
}

interface ProductsData {
  total_product_revenue: number;
  total_units_sold: number;
  top_products: ProductItem[];
  low_stock: { name: string; stock: number; reorder_point: number }[];
  package_usage?: { name: string; active: number; redeemed: number }[];
  package_revenue?: number;
  report_basis?: string;
}

export default function ProductsReport() {
  const { t } = useTranslation();
  const pr = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.productsReport.${key}`, opts) as string,
    [t],
  );
  const { selectedLocationId, provider } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange, { timezone: provider?.timezone });
  const rangeCaption = formatReportRangeCaption(from, to);
  const productsReportUrl = appendReportLocation(`/api/provider/reports/products?from=${from}&to=${to}`, selectedLocationId);
  const { data, loading, error: dataError, errorCode: dataErrorCode, refresh } = useApi<ProductsData>(productsReportUrl, {
    timeoutMs: MONEY_SURFACE_TIMEOUT_MS,
  });
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      pr("exportHeading", { from, to }),
      pr("exportTotalRevenue", { amount: formatCurrency(data.total_product_revenue) }),
      pr("exportTotalUnits", { count: data.total_units_sold }),
      data.report_basis || "",
      "",
      pr("exportTopProducts"),
      ...data.top_products.slice(0, 10).map((p, i) => `  ${pr("exportProductLine", { index: i + 1, name: p.name, units: p.units_sold, amount: formatCurrency(p.revenue) })}`),
      "",
      data.low_stock.length > 0 ? pr("exportLowStock") : "",
      ...data.low_stock.map((p) => `  ${pr("exportLowStockLine", { name: p.name, stock: p.stock, reorder: p.reorder_point })}`),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: pr("exportTitle") });
  }, [data, from, to, pr]);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title={pr("title")} showBack subtitle={pr("subtitle")} />

      <View style={twStyle("mb-3")}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", paddingBottom: 4 }}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[twStyle(`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`), { marginEnd: 8 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDateRange(r.value); }}
            >
              <Text style={twStyle(`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`)}>{pr(r.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={twStyle("text-xs text-gray-500")}>{rangeCaption}</Text>
      </View>

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#8b5cf6" />}
      {!loading && dataError && !data && (
        <FinanceReportError error={dataError} errorCode={dataErrorCode} onRetry={refresh} />
      )}
      {!loading && !data && !dataError && <EmptyState icon="bag-outline" title={pr("emptyTitle")} description={pr("emptyDescription")} />}

      {data && (
        <View>
          <View style={twStyle("mb-4")}>
            <ReportResponsiveStatRow>
              <StatCard title={pr("statProductRevenue")} value={formatCurrency(data.total_product_revenue)} icon="cash-outline" iconColor="#8b5cf6" iconBg="bg-violet-50" compact />
              <StatCard title={pr("statUnitsSold")} value={String(data.total_units_sold)} icon="cube-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
            </ReportResponsiveStatRow>
            {data.report_basis ? (
              <Text style={twStyle("mt-2 text-xs leading-4 text-gray-500")}>{data.report_basis}</Text>
            ) : null}
          </View>

          {data.top_products.length > 0 && (
            <View>
              <SectionHeader title={pr("topSelling")} />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.top_products.slice(0, 10).map((p, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-3 border-b border-gray-50")}>
                    <View style={twStyle("flex-row items-center flex-1")}>
                      <View style={twStyle("h-8 w-8 rounded-full bg-violet-100 items-center justify-center me-3")}>
                        <Text style={twStyle("text-sm font-bold text-violet-600")}>{i + 1}</Text>
                      </View>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>{p.name}</Text>
                        <Text style={twStyle("text-xs text-gray-400")}>{p.current_stock != null ? pr("unitsSoldInStock", { count: p.units_sold, stock: p.current_stock }) : pr("unitsSold", { count: p.units_sold })}</Text>
                      </View>
                    </View>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(p.revenue)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.low_stock.length > 0 && (
            <View>
              <SectionHeader title={pr("lowStockAlerts")} />
              <View style={twStyle("rounded-2xl border border-red-100 bg-red-50 px-4 py-2")}>
                {data.low_stock.map((p, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-red-100")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons name="warning-outline" size={16} color="#ef4444" />
                      <Text style={twStyle("text-sm text-red-900 ms-2")}>{p.name}</Text>
                    </View>
                    <Text style={twStyle("text-sm font-semibold text-red-700")}>{pr("stockLeft", { count: p.stock })}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.package_usage && data.package_usage.length > 0 && (
            <View>
              <SectionHeader title={pr("packageUsage")} />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.package_usage.map((p, i) => (
                  <View key={i} style={twStyle("py-3 border-b border-gray-50")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>{p.name}</Text>
                    <View style={twStyle("flex-row mt-1")}>
                      <Text style={[twStyle("text-xs text-gray-500"), { marginEnd: 16 }]}>{pr("activeLabel")} <Text style={twStyle("font-medium text-gray-700")}>{p.active}</Text></Text>
                      <Text style={twStyle("text-xs text-gray-500")}>{pr("redeemedLabel")} <Text style={twStyle("font-medium text-gray-700")}>{p.redeemed}</Text></Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity style={twStyle("rounded-xl bg-gray-100 py-3 px-4 flex-row items-center justify-center")} onPress={handleExport}>
            <Ionicons name="share-outline" size={18} color="#374151" />
            <Text style={twStyle("ms-2 text-sm font-medium text-gray-700")}>{pr("exportReport")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
