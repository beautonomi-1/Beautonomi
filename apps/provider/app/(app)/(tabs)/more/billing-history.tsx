import { useCallback, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { formatCurrency, formatStatusLabel } from "@/lib/format";

export interface BillingItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  type?: "subscription" | "ads" | string;
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

type BillingHistoryResponse = {
  items?: BillingItem[];
  total?: number;
  limit?: number;
  has_more?: boolean;
};

/** Content-only for use in Billing hub tab. */
export function BillingHistoryContent() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [limit, setLimit] = useState(50);
  const { data, loading, error, refresh } = useApi<BillingItem[] | BillingHistoryResponse>(
    `/api/provider/billing-history?limit=${limit}`,
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const items: BillingItem[] = Array.isArray(data)
    ? data
    : (data?.items ?? []);
  const canLoadMore = Array.isArray(data)
    ? items.length >= limit && limit < 200
    : Boolean(data?.has_more) && limit < 200;
  const openInvoice = async (item: BillingItem) => {
    const url = item.invoice_url?.trim();
    if (!url) return;
    // Ads receipt PDFs are session-protected; the native in-app browser can't
    // attach the bearer token, so mint a short-lived signed URL first.
    const adsMatch = url.match(/\/api\/provider\/ads\/orders\/([^/]+)\/receipt\/pdf/);
    if (adsMatch?.[1]) {
      try {
        const res = await api.post<{ url?: string }>(
          `/api/provider/ads/orders/${adsMatch[1]}/receipt/signed-url`,
          {},
        );
        const signed = res.data?.url?.trim();
        if (signed) {
          pushInAppBrowser(router, signed, "Receipt");
          return;
        }
      } catch {
        // Fall through to a best-effort direct open below.
      }
    }
    // Subscription receipts are also session-protected — mint a signed URL.
    const subMatch = url.match(/\/api\/provider\/subscription\/receipts\/([^/]+)\/pdf/);
    if (subMatch?.[1]) {
      try {
        const res = await api.post<{ url?: string }>(
          `/api/provider/subscription/receipts/${subMatch[1]}/signed-url`,
          {},
        );
        const signed = res.data?.url?.trim();
        if (signed) {
          pushInAppBrowser(router, signed, "Receipt");
          return;
        }
      } catch {
        // Fall through to a best-effort direct open below.
      }
    }
    pushInAppBrowser(router, url, "Invoice");
  };

  if (loading && !data) {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}
      >
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {items.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 64 }}>
          <View
            style={{
              marginBottom: 16,
              width: 64,
              height: 64,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 32,
              backgroundColor: "#e0e7ff",
            }}
          >
            <Ionicons name="document-text-outline" size={32} color="#6366f1" />
          </View>
          <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900] }}>
            No billing history
          </Text>
          <Text
            style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}
          >
            Subscription and ads payments will appear here.
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            style={{
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              backgroundColor: Colors.white,
              padding: 16,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: item.type === "ads" ? "#fef3c7" : "#e0e7ff",
              }}
            >
              <Ionicons
                name={item.type === "ads" ? "megaphone-outline" : "receipt-outline"}
                size={20}
                color={item.type === "ads" ? "#b45309" : "#6366f1"}
              />
            </View>
            <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                {item.description ?? "Payment"}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
                {formatCurrency(item.amount, item.currency)}
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
                style={{
                  fontSize: 12,
                  fontWeight: "500",
                  color: item.status === "paid" ? "#166534" : Colors.gray[700],
                }}
              >
                {formatStatusLabel(item.status)}
              </Text>
            </View>
            {item.invoice_url ? (
              <TouchableOpacity
                onPress={() => void openInvoice(item)}
                style={{
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  backgroundColor: "#eef2ff",
                }}
              >
                <Ionicons name="open-outline" size={18} color="#6366f1" />
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}
      {canLoadMore ? (
        <TouchableOpacity
          onPress={() => setLimit((n) => Math.min(n + 50, 200))}
          disabled={loading}
          activeOpacity={0.75}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
            paddingVertical: 14,
            opacity: loading ? 0.6 : 1,
          }}
          accessibilityRole="button"
          accessibilityLabel="Load more billing history"
        >
          <Ionicons name="chevron-down" size={16} color={Colors.primary} />
          <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.primary }}>
            {loading ? "Loading…" : "Load more"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

export default function BillingHistoryScreen() {
  return <Redirect href="/(app)/(tabs)/more/billing?tab=bills" />;
}
