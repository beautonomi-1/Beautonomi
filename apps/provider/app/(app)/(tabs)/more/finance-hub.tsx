import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { hapticLight } from "@/lib/haptics-safe";

type Earnings = { total_earnings?: number; pending_payouts?: number; available_balance?: number; this_month?: number };
type FinanceResponse = { earnings?: Earnings; transactions?: unknown[] };

export default function FinanceHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<FinanceResponse>("/api/provider/finance");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Finance" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Finance" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const earnings = (data as FinanceResponse)?.earnings;
  const total = earnings?.total_earnings ?? 0;
  const pending = earnings?.pending_payouts ?? 0;
  const available = earnings?.available_balance ?? 0;
  const currency = getTenantDefaultCurrency();

  return (
    <ScreenContainer>
      <ScreenHeader title="Finance" subtitle="Earnings and payouts" onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Total earnings</Text>
          <Text style={{ marginTop: 4, fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>
            {currency} {typeof total === "number" ? total.toLocaleString() : "—"}
          </Text>
          {(pending > 0 || available > 0) && (
            <View style={{ marginTop: 8 }}>
              {available > 0 && <Text style={{ fontSize: 14, color: "#15803d" }}>Available: {currency} {available.toLocaleString()}</Text>}
              {pending > 0 && <Text style={{ fontSize: 14, color: "#b45309" }}>Pending: {currency} {pending.toLocaleString()}</Text>}
            </View>
          )}
        </View>

        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[500], marginBottom: 10 }}>Quick actions</Text>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              router.push({
                pathname: "/(app)/(tabs)/more/portal",
                params: { path: encodeURIComponent("/provider/payouts"), title: "Payouts" },
              } as never);
            }}
            style={{
              flex: 1,
              minHeight: 88,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              backgroundColor: Colors.gray[50],
              padding: 14,
              justifyContent: "space-between",
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open payouts in browser"
          >
            <Ionicons name="cash-outline" size={22} color={Colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Payouts</Text>
            <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Web</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              router.push({
                pathname: "/(app)/(tabs)/more/portal",
                params: { path: encodeURIComponent("/provider/team/payroll"), title: "Payroll" },
              } as never);
            }}
            style={{
              flex: 1,
              minHeight: 88,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              backgroundColor: Colors.gray[50],
              padding: 14,
              justifyContent: "space-between",
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open payroll in browser"
          >
            <Ionicons name="people-outline" size={22} color={Colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Payroll</Text>
            <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Web</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/finance-billing-hub" as never)}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 16 }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
            Invoices, payroll, payouts, billing history, gift cards — all in the app.
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "500", color: "#4f46e6" }}>Finance & billing →</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
