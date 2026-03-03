import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";

const PRIMARY = Colors.primary;

interface ReturnRequest {
  id: string;
  product_name: string;
  reason: string;
  quantity: number;
  refund_amount: number;
  status: string;
  created_at: string;
  order: { order_number: string; provider: { business_name: string } };
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "Pending", color: "#F59E0B", icon: "time-outline" },
  approved: { label: "Approved", color: "#3B82F6", icon: "checkmark-circle-outline" },
  item_received: { label: "Item Received", color: "#8B5CF6", icon: "archive-outline" },
  refunded: { label: "Refunded", color: "#22C55E", icon: "cash-outline" },
  rejected: { label: "Rejected", color: "#EF4444", icon: "close-circle-outline" },
  escalated: { label: "Escalated", color: "#DC2626", icon: "alert-circle-outline" },
  resolved_by_admin: { label: "Resolved", color: "#6B7280", icon: "shield-checkmark-outline" },
  cancelled: { label: "Cancelled", color: "#9CA3AF", icon: "ban-outline" },
};

export default function MyReturnsScreen() {
  const router = useRouter();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReturns = useCallback(async () => {
    const res = await api.get<{ returns: ReturnRequest[] }>("/api/me/returns");
    if (res.data) setReturns(res.data.returns);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchReturns();
      setLoading(false);
    })();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
          My Returns
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : returns.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="arrow-undo-outline" size={48} color="#D1D5DB" />
          <Text style={{ fontSize: 16, color: "#6B7280", marginTop: 12 }}>No return requests yet</Text>
          <Text style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, textAlign: "center" }}>
            You can request a return from your order details within 14 days of delivery.
          </Text>
        </View>
      ) : (
        <FlatList
          data={returns}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: 24,
            ...(Platform.OS === "web" ? ({ maxWidth: 600, alignSelf: "center", width: "100%" } as any) : {}),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await fetchReturns(); setRefreshing(false); }}
              tintColor={PRIMARY}
            />
          }
          renderItem={({ item: r }) => {
            const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
            const canEscalate = r.status === "rejected";

            return (
              <View
                style={{
                  backgroundColor: "#fff",
                  marginHorizontal: 16,
                  marginBottom: 12,
                  borderRadius: 16,
                  padding: 16,
                  ...(Platform.select({
                    web: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
                    default: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
                  }) as any),
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827" }}>
                    {r.order?.order_number}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: `${cfg.color}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, gap: 4 }}>
                    <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: cfg.color }}>{cfg.label}</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 15, color: "#374151", marginBottom: 4 }} numberOfLines={1}>
                  {r.product_name}
                </Text>
                <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>
                  {r.order?.provider?.business_name} · {r.reason.replace(/_/g, " ")} · Qty: {r.quantity}
                </Text>

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: PRIMARY }}>
                    R{Number(r.refund_amount).toFixed(2)}
                  </Text>
                </View>

                {canEscalate && (
                  <TouchableOpacity
                    onPress={async () => {
                      await api.patch(`/api/me/returns/${r.id}`, { action: "escalate" });
                      await fetchReturns();
                    }}
                    style={{
                      marginTop: 12,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#EF4444",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#EF4444" }}>
                      Escalate to Support
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
