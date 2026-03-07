import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";

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
  const { screenPadding } = useResponsive();

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Finance & billing"
        subtitle="Earnings, payroll, invoices & gift cards"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "rgba(240,253,244,0.5)", padding: 12 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[700] }}>
            All finance and billing is managed in the app. No need to open a browser.
          </Text>
        </View>
        {ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            onPress={() => router.push(item.route as never)}
            style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
            activeOpacity={0.7}
          >
            <View
              style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: `${item.color}20` }}
            >
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{item.label}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
