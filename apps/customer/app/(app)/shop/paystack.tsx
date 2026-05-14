import { useEffect, useMemo } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { emitCartUpdated } from "@/lib/cart-events";
import { isReferenceProcessing, clearReferenceProcessing } from "@/lib/paystack-verify-guard";

function pickRef(params: Record<string, string | string[] | undefined>): string {
  const raw = params.reference ?? params.trxref;
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return typeof v === "string" ? v.trim() : "";
}

function unwrapVerifyStatus(body: unknown): string | null {
  let cur: unknown = body;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const st = o.status;
    if (typeof st === "string" && st.trim()) return st.trim();
    cur = o.data;
  }
  return null;
}

function extractProductOrderId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const top = body as Record<string, unknown>;
  const direct = top.productOrderId ?? top.product_order_id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  let cur: unknown = top.data;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const id = o.productOrderId ?? o.product_order_id;
    if (typeof id === "string" && id.trim()) return id.trim();
    cur = o.data;
  }
  return null;
}

function pickParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const raw = params[key];
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Paystack return for shop checkout (`ExpoLinking.createURL("shop/paystack")`).
 */
export default function ShopPaystackReturnScreen() {
  const params = useLocalSearchParams();
  const reference = useMemo(() => pickRef(params as Record<string, string | string[] | undefined>), [params]);
  const cancelledFlag = useMemo(
    () => pickParam(params as Record<string, string | string[] | undefined>, "cancelled"),
    [params],
  );

  useEffect(() => {
    let aborted = false;

    if (cancelledFlag === "1") {
      router.replace("/(app)/(tabs)/cart" as never);
      return;
    }

    if (reference && isReferenceProcessing(reference)) {
      clearReferenceProcessing(reference);
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/product-orders" as never);
      }, 5000);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }

    (async () => {
      if (!reference) {
        router.replace("/(app)/(tabs)/cart" as never);
        return;
      }
      try {
        const res = await api.get<unknown>(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
        if (aborted) return;
        if (res.error) {
          router.replace("/(app)/product-orders" as never);
          return;
        }
        const orderId = extractProductOrderId(res.data as unknown);
        if (orderId) {
          emitCartUpdated();
          router.replace({ pathname: "/(app)/product-order-detail", params: { id: orderId } } as never);
          return;
        }
        if (unwrapVerifyStatus(res.data as unknown) === "success") {
          emitCartUpdated();
        }
      } catch {
        // ignore
      }
      if (!aborted) router.replace("/(app)/product-orders" as never);
    })();
    return () => {
      aborted = true;
    };
  }, [reference, cancelledFlag]);

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
