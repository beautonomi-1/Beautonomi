/**
 * Native fallback screen for More tab feature slugs.
 * Redirects known slugs to native routes and keeps unknown slugs in-app.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";
import { useEffect } from "react";

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: { id: string; title: string; completed: boolean; link: string }[];
}

const SLUG_TO_SUBTITLE: Record<string, string> = {
  "resources-forms-hub": "Resources, intake & consent forms",
  "custom-requests": "Client quotes & offers",
  "routes": "Optimize at-home trips",
  "products-ecommerce-hub": "Inventory, orders & sales",
  "catalogue-offerings-hub": "Services, products & packages",
  "finance-billing-hub": "Earnings, payroll, invoices & gift cards",
  "transactions-hub": "Payments, fees & sales",
  "reports": "Analytics, activity & insights",
  "engagement-hub": "Reviews, messaging & marketing",
  "finance-hub": "Earnings and payouts",
};

const SLUG_TO_NATIVE_ROUTE: Record<string, string> = {
  routes: "/(app)/(tabs)/more/routes",
  reports: "/(app)/(tabs)/more/reports",
  "finance-hub": "/(app)/(tabs)/more/finance",
  "finance-billing-hub": "/(app)/(tabs)/more/finance-billing-hub",
  "products-ecommerce-hub": "/(app)/(tabs)/more/products-ecommerce-hub",
  "catalogue-offerings-hub": "/(app)/(tabs)/more/catalogue",
  "custom-requests": "/(app)/(tabs)/more/custom-requests",
  /** Hub: resources + forms preview; full form CRUD is `more/forms`. */
  "resources-forms-hub": "/(app)/(tabs)/more/resources-forms-hub",
  "engagement-hub": "/(app)/(tabs)/more/engagement-hub",
  "bookings-calendar-hub": "/(app)/(tabs)/more/bookings",
  "team-hub": "/(app)/(tabs)/more/team",
};

function slugToTitle(slug: string): string {
  const map: Record<string, string> = {
    "bookings-calendar-hub": "Bookings",
    "resources-forms-hub": "Resources & forms",
    "custom-requests": "Custom requests",
    "routes": "Routes",
    "products-ecommerce-hub": "Products & e-commerce",
    "catalogue-offerings-hub": "Catalogue & offerings",
    "team-hub": "Team & scheduling",
    "finance-billing-hub": "Finance & billing",
    "transactions-hub": "Transactions & history",
    "reports": "Reports",
    "gallery": "Gallery",
    "engagement-hub": "Engagement",
    "waitlist": "Waitlist",
    "finance-hub": "Finance",
  };
  if (map[slug]) return map[slug];
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MoreSlugScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: setupStatus } = useApi<SetupStatus>("/api/provider/setup-status");
  const title = slug ? slugToTitle(slug) : "Feature";
  const subtitle = slug ? SLUG_TO_SUBTITLE[slug] : null;
  const showSetupBanner = setupStatus && !setupStatus.isComplete && setupStatus.completionPercentage < 100;
  const nativeRoute = slug ? SLUG_TO_NATIVE_ROUTE[slug] : null;

  useEffect(() => {
    if (!nativeRoute) return;
    router.replace(nativeRoute as never);
  }, [nativeRoute, router]);

  return (
    <ScreenContainer>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: 8, paddingTop: 16 }}>
        {showSetupBanner && (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings/setup-status" as never)}
            style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: "#c7d2fe", backgroundColor: "#eef2ff", padding: 14 }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#4338ca" }}>Setup status</Text>
                <Text style={{ marginTop: 2, fontSize: 13, color: "#6366f1" }}>
                  {setupStatus.completionPercentage}% complete
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#4338ca" />
            </View>
          </TouchableOpacity>
        )}
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 20 }}>
          <View style={{ marginBottom: 16, height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: Colors.gray[200] }}>
            <Ionicons name="desktop-outline" size={24} color="#6b7280" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[900] }}>{title}</Text>
          {subtitle && (
            <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[600] }}>{subtitle}</Text>
          )}
          <Text style={{ marginTop: 16, fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>
            This feature is being finalized in native. Use the related native sections while rollout completes.
          </Text>
          {nativeRoute && (
            <TouchableOpacity
              onPress={() => router.replace(nativeRoute as never)}
              style={{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: "#c7d2fe", backgroundColor: "#eef2ff", paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="arrow-forward-circle-outline" size={18} color="#4338ca" />
              <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: "#4338ca" }}>Open native screen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}
