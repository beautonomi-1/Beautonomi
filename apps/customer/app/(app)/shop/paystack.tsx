import { useEffect, useMemo } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";

function pickRef(params: Record<string, string | string[] | undefined>): string {
  const raw = params.reference ?? params.trxref;
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return typeof v === "string" ? v.trim() : "";
}

function extractProductOrderId(body: unknown): string | null {
  let cur: unknown = body;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const id = o.productOrderId ?? o.product_order_id;
    if (typeof id === "string" && id.trim()) return id.trim();
    cur = o.data;
  }
  return null;
}

/**
 * Paystack return for shop checkout (`ExpoLinking.createURL("shop/paystack")`).
 */
export default function ShopPaystackReturnScreen() {
  const params = useLocalSearchParams();
  const reference = useMemo(() => pickRef(params as Record<string, string | string[] | undefined>), [params]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!reference) {
        router.replace("/(app)/(tabs)/cart" as never);
        return;
      }
      try {
        const res = await api.get<unknown>(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
        if (cancelled) return;
        const orderId = extractProductOrderId(res.data as unknown);
        if (orderId) {
          router.replace({ pathname: "/(app)/product-order-detail", params: { id: orderId } } as never);
          return;
        }
      } catch {
        // ignore
      }
      if (!cancelled) router.replace("/(app)/product-orders" as never);
    })();
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, color: "#6B7280", textAlign: "center" }}>
          {reference ? "Confirming your order payment…" : "Returning to shop…"}
        </Text>
      </View>
    </>
  );
}
