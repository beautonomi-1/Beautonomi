import { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { formatCurrency } from "@/lib/format";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { ActiveLocationChip } from "@/components/reports/ActiveLocationChip";
import { ReportRevenueGlossary } from "@/components/reports/ReportRevenueGlossary";
import { useResponsive } from "@/hooks/useResponsive";
import { trackScreenView } from "@/lib/analytics";
import { appendReportLocation } from "@/lib/reportLocationQuery";
import { Colors } from "@/constants/colors";
import { PROVIDER_REPORT_CATEGORIES, type ProviderReportItem } from "./reportCatalog";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface AnalyticsSummary {
  revenue: { thisMonth: number; current_period?: number; growth: string };
  bookings: { thisMonth: number; upcoming: number; growth: string };
  customers: { total: number };
  basis?: {
    ledger_period?: string;
    bookings_in_period?: string;
  };
}

function navigateToReport(router: ReturnType<typeof useRouter>, report: ProviderReportItem) {
  if (report.target === "native") {
    router.push(`/(app)/(tabs)/more/reports/${report.screen}` as never);
    return;
  }
  if (report.target === "detail") {
    router.push(`/(app)/(tabs)/more/reports/detail/${report.reportId}` as never);
    return;
  }
  if (report.target === "route") {
    router.push(report.route as never);
    return;
  }
}

export default function ReportsIndex() {
  const { t } = useTranslation();
  const ri = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.reportsIndex.${key}`, opts) as string,
    [t],
  );
  const reportBadge = useCallback((report: ProviderReportItem): string => {
    if (report.target === "detail") return ri("badgeDetail");
    if (report.target === "native") return ri("badgeScreen");
    return ri("badgeLink");
  }, [ri]);
  const router = useRouter();
  const { isTablet } = useResponsive();
  const { selectedLocationId } = useProvider();
  const [search, setSearch] = useState("");
  const analyticsUrl = appendReportLocation("/api/provider/analytics?period=month", selectedLocationId);
  const { data: analytics, loading: analyticsLoading, error: analyticsError, refresh } = useApi<AnalyticsSummary>(analyticsUrl, {
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

  useEffect(() => {
    trackScreenView("provider_reports");
  }, []);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return PROVIDER_REPORT_CATEGORIES;
    const q = search.toLowerCase();
    return PROVIDER_REPORT_CATEGORIES.map((category) => ({
      ...category,
      reports: category.reports.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          category.title.toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.reports.length > 0);
  }, [search]);

  const revenueThisMonth = analytics?.revenue?.current_period ?? analytics?.revenue?.thisMonth ?? 0;
  const bookingsThisMonth = analytics?.bookings?.thisMonth ?? 0;
  const customersTotal = analytics?.customers?.total ?? 0;
  const revenueGrowth = analytics?.revenue?.growth ?? "0";
  const bookingsGrowth = analytics?.bookings?.growth ?? "0";

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title={ri("title")}
        showBack
        subtitle={ri("subtitle")}
      />
      <ActiveLocationChip />
      <ReportRevenueGlossary keys={["recognizedRevenue", "ledgerNet"]} />

      {analyticsLoading && !analytics ? (
        <View
          style={{
            marginBottom: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.gray[100],
            backgroundColor: "#f8fafc",
            padding: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 13, color: Colors.gray[400] }}>{ri("loadingSummary")}</Text>
        </View>
      ) : analyticsError && !analytics ? (
        <View
          style={{
            marginBottom: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#fecaca",
            backgroundColor: "#fef2f2",
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 13, color: "#dc2626" }}>{ri("loadFailed")}</Text>
        </View>
      ) : analytics ? (
        <View
          style={{
            marginBottom: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.gray[100],
            backgroundColor: "#f8fafc",
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>{ri("thisMonth")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                {formatCurrency(revenueThisMonth)}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginStart: 4 }}>{ri("earningsLedger")}</Text>
              {revenueGrowth !== "0" && revenueGrowth !== "New" && (
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginStart: 4 }}>{ri("growthPct", { growth: revenueGrowth })}</Text>
              )}
              {revenueGrowth === "New" && (
                <Text style={{ fontSize: 12, color: "#22c55e", marginStart: 4 }}>{ri("newBadge")}</Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[800] }}>{bookingsThisMonth}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginStart: 4 }}>{ri("bookingsCreated")}</Text>
              {bookingsGrowth !== "0" && bookingsGrowth !== "New" && (
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginStart: 4 }}>{ri("growthPct", { growth: bookingsGrowth })}</Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[800] }}>{customersTotal}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginStart: 4 }}>{ri("customers")}</Text>
            </View>
          </View>
          {analytics.basis?.ledger_period || analytics.basis?.bookings_in_period ? (
            <Text style={{ fontSize: 11, color: Colors.gray[500], marginTop: 8, lineHeight: 16 }}>
              {analytics.basis.ledger_period ? `${analytics.basis.ledger_period} ` : ""}
              {analytics.basis.bookings_in_period ?? ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginBottom: 12 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={ri("searchPlaceholder")} />
      </View>

      {filteredCategories.length === 0 ? (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.gray[100],
            backgroundColor: Colors.white,
            padding: 32,
          }}
        >
          <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
            {ri("noMatch", { search })}
          </Text>
        </View>
      ) : (
        filteredCategories.map((category) => (
          <View key={category.title} style={{ marginBottom: 16 }}>
            <SectionHeader title={category.title} />
            <View style={[isTablet ? { flexDirection: "row", flexWrap: "wrap" } : {}]}>
              {category.reports.map((report, reportIdx) => (
                <TouchableOpacity
                  key={report.id}
                  style={[
                    {
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: Colors.gray[100],
                      backgroundColor: Colors.white,
                      padding: 16,
                    },
                    isTablet && { width: "48.5%", marginEnd: 12, marginBottom: 12 },
                    !isTablet && reportIdx > 0 && { marginTop: 12 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    navigateToReport(router, report);
                  }}
                  accessibilityLabel={ri("viewReportA11y", { name: report.name })}
                  accessibilityRole="button"
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        height: 48,
                        width: 48,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 16,
                        backgroundColor: report.bg,
                      }}
                    >
                      <Ionicons name={report.icon} size={24} color={report.color} />
                    </View>
                    <View style={{ marginStart: 12, flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{report.name}</Text>
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 8,
                            backgroundColor: "#eef2ff",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "700",
                              color: "#4f46e5",
                              textTransform: "uppercase",
                            }}
                          >
                            {reportBadge(report)}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>{report.description}</Text>
                    </View>
                    <DirectionalIcon name="chevron-forward" size={18} color="#d1d5db" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
      )}

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}
