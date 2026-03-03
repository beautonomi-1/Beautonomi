import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

const ITEMS = [
  { icon: "wallet-outline" as const, label: "Earnings & summary", subtitle: "Total earnings, balance, pending", route: "/(app)/(tabs)/more/finance-hub", color: "#22c55e" },
  { icon: "card-outline" as const, label: "Payroll", subtitle: "Pay runs, approve, mark paid", route: "/(app)/(tabs)/more/payroll", color: "#0d9488" },
  { icon: "document-text-outline" as const, label: "Invoices", subtitle: "Create, view, send invoices", route: "/(app)/(tabs)/more/invoices", color: "#6366f1" },
  { icon: "arrow-down-circle-outline" as const, label: "Payouts", subtitle: "Request payouts, view history", route: "/(app)/(tabs)/more/payouts", color: "#059669" },
  { icon: "receipt-outline" as const, label: "Billing history", subtitle: "Past bills and statements", route: "/(app)/(tabs)/more/billing-history", color: "#8b5cf6" },
  { icon: "gift-outline" as const, label: "Gift cards", subtitle: "Accept platform gift cards", route: "/(app)/(tabs)/more/gift-cards", color: "#a855f7" },
];

export default function FinanceBillingHubScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Finance & billing"
        subtitle="Earnings, payroll, invoices & gift cards"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-3 rounded-xl border border-green-100 bg-green-50/50 p-3">
          <Text className="text-sm text-gray-700">
            All finance and billing is managed in the app. No need to open a browser.
          </Text>
        </View>
        {ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            onPress={() => router.push(item.route as never)}
            className="mb-3 flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
            activeOpacity={0.7}
          >
            <View
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${item.color}20` }}
            >
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="font-semibold text-gray-900">{item.label}</Text>
              <Text className="text-xs text-gray-500">{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
