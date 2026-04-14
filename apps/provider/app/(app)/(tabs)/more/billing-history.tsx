import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

export interface BillingItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description?: string | null;
  created_at: string;
  invoice_url?: string | null;
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

/** Content-only for use in Settings hub tab. */
export function BillingHistoryContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<BillingItem[]>(
    "/api/provider/billing-history"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const items: BillingItem[] = Array.isArray(data) ? data : [];
  const openInvoice = (item: BillingItem) => {
    const url = item.invoice_url?.trim();
    if (!url) return;
    Linking.openURL(url);
  };

  if (loading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      {items.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 64 }}>
          <View style={{ marginBottom: 16, width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 32, backgroundColor: "#e0e7ff" }}>
            <Ionicons name="document-text-outline" size={32} color="#6366f1" />
          </View>
          <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900] }}>No billing history</Text>
          <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
            Subscription and platform payments will appear here.
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
          >
            <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#e0e7ff" }}>
              <Ionicons name="receipt-outline" size={20} color="#6366f1" />
            </View>
            <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                {item.description ?? "Payment"}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
                {item.currency} {Number(item.amount).toFixed(2)}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                {formatDateSafe(item.created_at)}
              </Text>
            </View>
            <View
              style={{
                marginRight: 8,
                borderRadius: 9999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: item.status === "paid" ? "#dcfce7" : Colors.gray[100],
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "500", color: item.status === "paid" ? "#166534" : Colors.gray[700] }}
              >
                {item.status}
              </Text>
            </View>
            {item.invoice_url ? (
              <TouchableOpacity
                onPress={() => openInvoice(item)}
                style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#eef2ff" }}
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
