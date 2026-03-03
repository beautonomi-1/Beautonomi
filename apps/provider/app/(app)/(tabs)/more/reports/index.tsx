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
        bg: "bg-indigo-50",
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
        bg: "bg-green-50",
        description: "Revenue trends, breakdowns by service and staff",
      },
      {
        name: "Sales by Service",
        screen: "services",
        icon: "cut-outline",
        color: "#f59e0b",
        bg: "bg-amber-50",
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
        bg: "bg-blue-50",
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
        bg: "bg-pink-50",
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
        bg: "bg-indigo-50",
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
        bg: "bg-sky-50",
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
        bg: "bg-violet-50",
        description: "Top sellers, stock levels, inventory analytics",
      },
      {
        name: "Package Report",
        screen: "packages",
        icon: "layers-outline",
        color: "#14b8a6",
        bg: "bg-teal-50",
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
        bg: "bg-purple-50",
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
        bg: "bg-violet-50",
        description: "Business performance and trends",
        href: "/(app)/(tabs)/more/analytics",
      },
      {
        name: "Activity",
        screen: "activity",
        icon: "pulse-outline",
        color: "#0d9488",
        bg: "bg-teal-50",
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

      <View className="mb-3">
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search reports..."
        />
      </View>

      {filteredCategories.length === 0 ? (
        <View className="rounded-2xl border border-gray-100 bg-white p-8">
          <Text className="text-center text-sm text-gray-500">
            No reports match &quot;{search}&quot;
          </Text>
        </View>
      ) : (
        filteredCategories.map((category) => (
        <View key={category.title} className="mb-4">
          <SectionHeader title={category.title} />
          <View className={isTablet ? "flex-row flex-wrap gap-3" : "gap-3"}>
            {category.reports.map((report) => (
              <TouchableOpacity
                key={report.screen}
                className={`rounded-2xl border border-gray-100 bg-white p-4 ${
                  isTablet ? "w-[48.5%]" : ""
                }`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const path = report.href ?? `/(app)/(tabs)/more/reports/${report.screen}`;
                  router.push(path as any);
                }}
                accessibilityLabel={`View ${report.name} report`}
                accessibilityRole="button"
              >
                <View className="flex-row items-center">
                  <View
                    className={`${report.bg} h-12 w-12 items-center justify-center rounded-xl`}
                  >
                    <Ionicons name={report.icon} size={24} color={report.color} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-base font-semibold text-gray-900">
                      {report.name}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      {report.description}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        ))
      )}

      <View className="h-8" />
    </ScreenContainer>
  );
}
