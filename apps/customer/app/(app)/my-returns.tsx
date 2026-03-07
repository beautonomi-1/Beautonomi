import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";

interface ReturnItem {
  id: string;
  product_name: string;
  reason: string;
  quantity: number;
  refund_amount: number;
  status: string;
  created_at: string;
  order?: { order_number?: string; provider?: { business_name?: string } };
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "#FEF3C7", text: "#92400E" },
  approved: { label: "Approved", bg: "#DBEAFE", text: "#1E40AF" },
  item_received: { label: "Item received", bg: "#E9D5FF", text: "#6B21A8" },
  refunded: { label: "Refunded", bg: "#D1FAE5", text: "#065F46" },
  rejected: { label: "Rejected", bg: "#FEE2E2", text: "#B91C1C" },
  escalated: { label: "Escalated", bg: "#FECACA", text: "#991B1B" },
  resolved_by_admin: { label: "Resolved", bg: "#F3F4F6", text: "#374151" },
  cancelled: { label: "Cancelled", bg: "#F3F4F6", text: "#6B7280" },
};

function formatStatus(s: string): string {
  return (STATUS_LABELS[s] ?? { label: s.replace(/_/g, " ") }).label;
}

function statusStyle(s: string) {
  const st = STATUS_LABELS[s] ?? { bg: "#F3F4F6", text: "#374151" };
  return { backgroundColor: st.bg, color: st.text };
}

export default function MyReturnsScreen() {
  const { contentPadding } = useResponsive();
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const returnsUrl = APP_URL ? `${APP_URL}/account-settings/returns` : null;
  const ordersUrl = APP_URL ? `${APP_URL}/account-settings/orders` : null;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ returns?: ReturnItem[] }>("/api/me/returns");
      const data = (res.data as { returns?: ReturnItem[] }) ?? res.data;
      const list = data?.returns ?? (Array.isArray(data) ? data : []);
      setReturns(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load returns");
      setReturns([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = useCallback(
    (id: string) => {
      Alert.alert("Cancel return", "Are you sure you want to cancel this return request?", [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: async () => {
            setActionId(id);
            try {
              const res = await api.patch(`/api/me/returns/${id}`, { action: "cancel" });
              if (res.error) Alert.alert("Error", (res.error as { message?: string })?.message ?? "Failed to cancel");
              else await load();
            } catch {
              Alert.alert("Error", "Failed to cancel return");
            } finally {
              setActionId(null);
            }
          },
        },
      ]);
    },
    [load]
  );

  const handleEscalate = useCallback(
    async (id: string) => {
      setActionId(id);
      try {
        const res = await api.patch(`/api/me/returns/${id}`, { action: "escalate" });
        if (res.error) Alert.alert("Error", (res.error as { message?: string })?.message ?? "Failed to escalate");
        else await load();
      } catch {
        Alert.alert("Error", "Failed to escalate");
      } finally {
        setActionId(null);
      }
    },
    [load]
  );

  if (loading && returns.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Returns & Refunds" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 12, color: Colors.gray[500] }}>Loading…</Text>
        </View>
      </>
    );
  }

  if (error && returns.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Returns & Refunds" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Returns & Refunds" }} />
      <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: contentPadding, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.gray[100] }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Track return requests and refunds</Text>
          {ordersUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(ordersUrl)}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>View orders</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {returns.length === 0 ? (
          <View style={{ flex: 1, padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Ionicons name="arrow-undo-outline" size={32} color={Colors.gray[400]} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], textAlign: "center", marginBottom: 8 }}>No return requests</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
              You can request a return from your order details within 14 days of delivery.
            </Text>
            <TouchableOpacity onPress={() => router.push("/(app)/product-orders" as any)} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}>
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>View my orders</Text>
            </TouchableOpacity>
            {returnsUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(returnsUrl)} style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 14, color: Colors.primary }}>Open in browser</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={returns}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: contentPadding, paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
            renderItem={({ item: r }) => {
              const statusSt = statusStyle(r.status);
              const busy = actionId === r.id;
              return (
                <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 2 }}>Order {r.order?.order_number ?? "—"}</Text>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>{r.product_name}</Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>
                        {r.order?.provider?.business_name ?? ""} · {r.reason.replace(/_/g, " ")} · Qty {r.quantity}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, ...statusSt }}>
                        <Text style={{ fontSize: 11, fontWeight: "600", ...statusSt }}>{formatStatus(r.status)}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900], marginTop: 8 }}>R{Number(r.refund_amount).toFixed(2)}</Text>
                      <Text style={{ fontSize: 11, color: Colors.gray[400] }}>{new Date(r.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    {r.status === "pending" && (
                      <TouchableOpacity
                        onPress={() => handleCancel(r.id)}
                        disabled={busy}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200] }}
                      >
                        {busy ? <ActivityIndicator size="small" color={Colors.gray[600]} /> : <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700] }}>Cancel request</Text>}
                      </TouchableOpacity>
                    )}
                    {r.status === "rejected" && (
                      <TouchableOpacity
                        onPress={() => handleEscalate(r.id)}
                        disabled={busy}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}
                      >
                        {busy ? <ActivityIndicator size="small" color="#B91C1C" /> : <Text style={{ fontSize: 13, fontWeight: "500", color: "#B91C1C" }}>Escalate</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        {returns.length > 0 && returnsUrl ? (
          <View style={{ padding: contentPadding, paddingTop: 0 }}>
            <TouchableOpacity onPress={() => Linking.openURL(returnsUrl)} style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "500" }}>Open full returns in browser</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </>
  );
}
