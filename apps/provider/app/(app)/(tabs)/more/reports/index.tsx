import { useState, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
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

interface AnalyticsSummary {
  revenue: { thisMonth: number; growth: string };
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

function reportBadge(report: ProviderReportItem): string {
  if (report.target === "detail") return "Detail";
  if (report.target === "native") return "Screen";
  return "Link";
}

export default function ReportsIndex() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const { selectedLocationId } = useProvider();
  const [search, setSearch] = useState("");
  const analyticsUrl = appendReportLocation("/api/provider/analytics?period=month", selectedLocationId);
  const { data: analytics, loading: analyticsLoading, error: analyticsError } = useApi<AnalyticsSummary>(analyticsUrl);

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

  const revenueThisMonth = analytics?.revenue?.thisMonth ?? 0;
  const bookingsThisMonth = analytics?.bookings?.thisMonth ?? 0;
  const customersTotal = analytics?.customers?.total ?? 0;
  const revenueGrowth = analytics?.revenue?.growth ?? "0";
  const bookingsGrowth = analytics?.bookings?.growth ?? "0";

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Reports"
        showBack
        subtitle="Same data as the web portal — all reports open in the app"
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
          <Text style={{ fontSize: 13, color: Colors.gray[400] }}>Loading summary…</Text>
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
          <Text style={{ fontSize: 13, color: "#dc2626" }}>Could not load analytics summary. Pull to refresh.</Text>
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
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>This month</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                {formatCurrency(revenueThisMonth)}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 4 }}>earnings (ledger)</Text>
              {revenueGrowth !== "0" && revenueGrowth !== "New" && (
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 4 }}>({revenueGrowth}%)</Text>
              )}
              {revenueGrowth === "New" && (
                <Text style={{ fontSize: 12, color: "#22c55e", marginLeft: 4 }}>New</Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[800] }}>{bookingsThisMonth}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 4 }}>bookings created</Text>
              {bookingsGrowth !== "0" && bookingsGrowth !== "New" && (
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 4 }}>({bookingsGrowth}%)</Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[800] }}>{customersTotal}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 4 }}>customers</Text>
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
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search reports..." />
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
            No reports match &quot;{search}&quot;
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
                    isTablet && { width: "48.5%", marginRight: 12, marginBottom: 12 },
                    !isTablet && reportIdx > 0 && { marginTop: 12 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    navigateToReport(router, report);
                  }}
                  accessibilityLabel={`View ${report.name} report`}
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
                    <View style={{ marginLeft: 12, flex: 1 }}>
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
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
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
