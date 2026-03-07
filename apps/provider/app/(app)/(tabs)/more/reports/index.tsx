import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";

interface ReportItem {
  name: string;
  screen: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  description: string;
  /** When set, navigate to this path instead of reports/{screen} */
  href?: string;
}

interface ReportCategory {
  title: string;
  reports: ReportItem[];
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    title: "Overview",
    reports: [
      {
        name: "Business Overview",
        screen: "business",
        icon: "pie-chart-outline",
        color: "#6366f1",
        bg: "#eef2ff",
        description: "Full performance dashboard with all key metrics",
      },
    ],
  },
  {
    title: "Revenue & Sales",
    reports: [
      {
        name: "Revenue Overview",
        screen: "revenue",
        icon: "cash-outline",
        color: "#22c55e",
        bg: "#dcfce7",
        description: "Revenue trends, breakdowns by service and staff",
      },
      {
        name: "Sales by Service",
        screen: "services",
        icon: "cut-outline",
        color: "#f59e0b",
        bg: "#fef3c7",
        description: "Which services generate the most revenue",
      },
    ],
  },
  {
    title: "Bookings",
    reports: [
      {
        name: "Booking Analytics",
        screen: "bookings",
        icon: "calendar-outline",
        color: "#3b82f6",
        bg: "#dbeafe",
        description: "Status breakdown, trends, cancellations, no-shows",
      },
    ],
  },
  {
    title: "Clients",
    reports: [
      {
        name: "Client Insights",
        screen: "clients",
        icon: "people-outline",
        color: "#ec4899",
        bg: "#fce7f3",
        description: "New vs returning, retention, lifetime value, top spenders",
      },
    ],
  },
  {
    title: "Staff",
    reports: [
      {
        name: "Staff Performance",
        screen: "staff",
        icon: "person-outline",
        color: "#6366f1",
        bg: "#eef2ff",
        description: "Hours worked, commissions, booking counts, ratings",
      },
    ],
  },
  {
    title: "Payments",
    reports: [
      {
        name: "Payment Analytics",
        screen: "payments",
        icon: "card-outline",
        color: "#0ea5e9",
        bg: "#e0f2fe",
        description: "Methods, payouts, refunds, totals",
      },
    ],
  },
  {
    title: "Products & Packages",
    reports: [
      {
        name: "Product & Inventory",
        screen: "products",
        icon: "bag-outline",
        color: "#8b5cf6",
        bg: "#ede9fe",
        description: "Top sellers, stock levels, inventory analytics",
      },
      {
        name: "Package Report",
        screen: "packages",
        icon: "layers-outline",
        color: "#14b8a6",
        bg: "#ccfbf1",
        description: "Package sales, usage rates, active subscriptions",
      },
    ],
  },
  {
    title: "Gift Cards",
    reports: [
      {
        name: "Gift Card Report",
        screen: "gift-cards",
        icon: "gift-outline",
        color: "#a855f7",
        bg: "#f3e8ff",
        description: "Sales, redemptions, outstanding value",
      },
    ],
  },
  {
    title: "Insights",
    reports: [
      {
        name: "Analytics",
        screen: "analytics",
        icon: "analytics-outline",
        color: "#8b5cf6",
        bg: "#ede9fe",
        description: "Business performance and trends",
        href: "/(app)/(tabs)/more/analytics",
      },
      {
        name: "Activity",
        screen: "activity",
        icon: "pulse-outline",
        color: "#0d9488",
        bg: "#ccfbf1",
        description: "Recent business activity",
        href: "/(app)/(tabs)/more/activity",
      },
    ],
  },
];

export default function ReportsIndex() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return REPORT_CATEGORIES;
    const q = search.toLowerCase();
    return REPORT_CATEGORIES.map((category) => ({
      ...category,
      reports: category.reports.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          category.title.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.reports.length > 0);
  }, [search]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Reports" showBack subtitle="Analytics & insights" />

      <View style={{ marginBottom: 12 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search reports..." />
      </View>

      {filteredCategories.length === 0 ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 32 }}>
          <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>No reports match &quot;{search}&quot;</Text>
        </View>
      ) : (
        filteredCategories.map((category) => (
        <View key={category.title} style={{ marginBottom: 16 }}>
          <SectionHeader title={category.title} />
          <View style={[isTablet ? { flexDirection: "row", flexWrap: "wrap" } : {}]}>
            {category.reports.map((report, reportIdx) => (
              <TouchableOpacity
                key={report.screen}
                style={[
                  { borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 },
                  isTablet && { width: "48.5%", marginRight: 12, marginBottom: 12 },
                  !isTablet && reportIdx > 0 && { marginTop: 12 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const path = report.href ?? `/(app)/(tabs)/more/reports/${report.screen}`;
                  router.push(path as any);
                }}
                accessibilityLabel={`View ${report.name} report`}
                accessibilityRole="button"
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: report.bg }}>
                    <Ionicons name={report.icon} size={24} color={report.color} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{report.name}</Text>
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
