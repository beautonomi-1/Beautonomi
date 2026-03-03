/**
 * Real screen for More tab features managed on the web portal.
 * No "coming soon" – clear instructions to manage in the web app.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

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

function slugToTitle(slug: string): string {
  const map: Record<string, string> = {
    "bookings-calendar-hub": "Bookings & calendar",
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
  const title = slug ? slugToTitle(slug) : "Feature";
  const subtitle = slug ? SLUG_TO_SUBTITLE[slug] : null;

  return (
    <ScreenContainer>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <View className="px-2 pt-4">
        <View className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-gray-200">
            <Ionicons name="desktop-outline" size={24} color="#6b7280" />
          </View>
          <Text className="text-base font-medium text-gray-900">{title}</Text>
          {subtitle && (
            <Text className="mt-1 text-sm text-gray-600">{subtitle}</Text>
          )}
          <Text className="mt-4 text-sm text-gray-600 leading-5">
            Manage this in the provider dashboard on the web. Open the same account in your browser for full editing, reports, and setup.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
