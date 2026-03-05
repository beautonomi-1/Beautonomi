import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

export interface BillingItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description?: string | null;
  created_at: string;
  invoice_url?: string | null;
}

/** Content-only for use in Settings hub tab. */
export function BillingHistoryContent() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<BillingItem[]>(
    "/api/provider/billing-history"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const items: BillingItem[] = Array.isArray(data) ? data : [];
  const openInvoice = (item: BillingItem) => {
    const url = item.invoice_url?.trim();
    if (!url) return;
    router.push({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: { url: encodeURIComponent(url), title: "Invoice" },
    } as never);
  };

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      {items.length === 0 ? (
        <View className="items-center py-16">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
            <Ionicons name="document-text-outline" size={32} color="#6366f1" />
          </View>
          <Text className="text-center font-semibold text-gray-900">No billing history</Text>
          <Text className="mt-1 text-center text-sm text-gray-500">
            Subscription and platform payments will appear here.
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
              <Ionicons name="receipt-outline" size={20} color="#6366f1" />
            </View>
            <View className="ml-3 flex-1 min-w-0">
              <Text className="font-semibold text-gray-900" numberOfLines={1}>
                {item.description ?? "Payment"}
              </Text>
              <Text className="mt-0.5 text-sm text-gray-600">
                {item.currency} {Number(item.amount).toFixed(2)}
              </Text>
              <Text className="mt-0.5 text-xs text-gray-500">
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
            <View
              className={`mr-2 rounded-full px-2.5 py-1 ${
                item.status === "paid" ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              <Text
                className={`text-xs font-medium ${item.status === "paid" ? "text-green-800" : "text-gray-700"}`}
              >
                {item.status}
              </Text>
            </View>
            {item.invoice_url ? (
              <TouchableOpacity
                onPress={() => openInvoice(item)}
                className="h-9 w-9 items-center justify-center rounded-lg bg-indigo-50"
              >
                <Ionicons name="open-outline" size={18} color="#6366f1" />
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

export default function BillingHistoryScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Billing History"
        showBack
        subtitle="Past payments & invoices"
      />
      <BillingHistoryContent />
    </ScreenContainer>
  );
}
