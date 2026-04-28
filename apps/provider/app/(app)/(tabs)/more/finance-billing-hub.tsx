import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";

/** All items use native screens (no portal) */
const FINANCE_ITEMS = [
  { icon: "wallet-outline" as const, label: "Earnings & summary", subtitle: "Period earnings, payout balance, transactions", route: "/(app)/(tabs)/more/finance", color: "#22c55e" },
  { icon: "phone-portrait-outline" as const, label: "Yoco payments", subtitle: "Connect Yoco and manage card devices", route: "/(app)/(tabs)/more/settings/yoco-devices", color: "#2563eb" },
  { icon: "ribbon-outline" as const, label: "Subscription & plan", subtitle: "Upgrade, renew, cancel or change billing", route: "/(app)/(tabs)/more/settings/subscription", color: "#8b5cf6" },
  { icon: "business-outline" as const, label: "Payout bank accounts", subtitle: "Add, verify and manage payout accounts", route: "/(app)/(tabs)/more/settings/payout-accounts", color: "#059669" },
  { icon: "card-outline" as const, label: "Payroll", subtitle: "Pay runs, approve, mark paid", route: "/(app)/(tabs)/more/payroll", color: "#0d9488" },
  { icon: "document-text-outline" as const, label: "Invoices", subtitle: "Create, view, send invoices", route: "/(app)/(tabs)/more/invoices", color: "#6366f1" },
  { icon: "arrow-down-circle-outline" as const, label: "Payouts", subtitle: "Request payouts, view history", route: "/(app)/(tabs)/more/payouts", color: "#059669" },
  { icon: "receipt-outline" as const, label: "Billing history", subtitle: "Past bills and statements", route: "/(app)/(tabs)/more/billing-history", color: "#8b5cf6" },
  { icon: "gift-outline" as const, label: "Gift cards", subtitle: "Accept platform gift cards", route: "/(app)/(tabs)/more/gift-cards", color: "#a855f7" },
  { icon: "document-attach-outline" as const, label: "VAT reports", subtitle: "VAT submissions & remittance", route: "/(app)/(tabs)/more/vat-reports", color: "#dc2626" },
  { icon: "bar-chart-outline" as const, label: "Team totals", subtitle: "Daily & weekly performance", route: "/(app)/(tabs)/more/team-totals", color: "#0d9488" },
  { icon: "cash-outline" as const, label: "My earnings", subtitle: "Your pay stubs & earnings", route: "/(app)/(tabs)/more/my-earnings", color: "#22c55e" },
];


export default function FinanceBillingHubScreen() {
  const router = useRouter();

  return (
    // §UX-audit 2026-04: `ScreenContainer` already renders a scrollable
    // ScrollView with safe-area aware bottom padding. Previously this
    // screen nested its own ScrollView inside, which produced a
    // double-scroll with gesture conflicts (momentum could stall, the
    // inner view would also bounce). Switch to a single scroll layer.
    <ScreenContainer>
      <ScreenHeader
        title="Finance & billing"
        subtitle="Earnings, payroll, invoices & more"
        onBack={() => router.back()}
      />
      {FINANCE_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.route}
          onPress={() => router.push(item.route as never)}
          style={twStyle("mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}. ${item.subtitle}`}
        >
          <View
            style={[twStyle("h-10 w-10 items-center justify-center rounded-2xl"), { backgroundColor: `${item.color}20` }]}
          >
            <Ionicons name={item.icon} size={22} color={item.color} />
          </View>
          <View style={twStyle("ml-3 flex-1")}>
            <Text style={twStyle("font-semibold text-gray-900")}>{item.label}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      ))}
    </ScreenContainer>
  );
}
