import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { getTenantLocaleTag } from "@/lib/locale";
import { formatMoney } from "@beautonomi/utils";

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(getTenantLocaleTag());
}

export default function PaymentsScreen() {
  const { bundle } = useConfigBundle();
  const tenantCur =
    bundle?.meta?.tenant_region?.default_currency?.trim() ?? getTenantDefaultCurrency();
  const saveCardInfo = useMemo(() => {
    const example = formatMoney(1, tenantCur);
    return `We'll save your card securely when you pay. To verify your card, a small temporary charge (e.g. ${example}) may be placed and reversed—this confirms your card for future use.`;
  }, [tenantCur]);

  const [methods, setMethods] = useState<any[]>([]);
  const [giftCards, setGiftCards] = useState<any[]>([]);
  const [giftCardsError, setGiftCardsError] = useState<string | null>(null);
  const [couponCount, setCouponCount] = useState<number>(0);
  const [couponCode, setCouponCode] = useState("");
  const [couponSubmitting, setCouponSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setGiftCardsError(null);
    try {
      // §Customer-launch (audit 2026-04): web payments page fetches coupon
      // count + supports redemption via /api/me/coupons/{count,redeem}.
      // Mobile previously shipped without any coupon surface at all, so
      // customers could never redeem a coupon code from the app. Pull
      // coupon count in parallel with cards + gift cards and surface
      // redeem UI below.
      const [methodsRes, giftRes, couponsRes] = await Promise.all([
        api.get<any>("/api/me/payment-methods"),
        api.get<any>("/api/me/gift-cards").catch((err) => {
          console.warn("Failed to load gift cards:", err);
          return { data: null, error: { message: "Couldn't load gift cards" } };
        }),
        api.get<any>("/api/me/coupons/count").catch((err) => {
          console.warn("Failed to load coupon count:", err);
          return { data: null };
        }),
      ]);
      if (methodsRes.error) {
        setError(methodsRes.error.message || "Failed to load");
      } else {
        const m = methodsRes.data;
        setMethods(Array.isArray(m) ? m : m?.data ?? []);
      }
      if (giftRes?.error) {
        setGiftCardsError(giftRes.error.message || "Couldn't load gift cards");
        setGiftCards([]);
      } else {
        const g = giftRes.data;
        setGiftCards(Array.isArray(g) ? g : g?.gift_cards ?? []);
      }
      const cData = couponsRes?.data as { count?: number; data?: { count?: number } } | undefined;
      const rawCount = cData?.count ?? cData?.data?.count ?? 0;
      setCouponCount(Number.isFinite(rawCount) ? Number(rawCount) : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const redeemCoupon = async () => {
    const code = couponCode.trim();
    if (!code) {
      Alert.alert("Coupon", "Enter a coupon code to redeem.");
      return;
    }
    setCouponSubmitting(true);
    try {
      const res = await api.post<{ message?: string; data?: { message?: string } }>(
        "/api/me/coupons/redeem",
        { code }
      );
      if (res.error) {
        Alert.alert("Coupon", res.error.message ?? "Could not redeem this coupon.");
        return;
      }
      setCouponCode("");
      setCouponCount((prev) => prev + 1);
      const successMsg =
        (res.data as { message?: string; data?: { message?: string } } | undefined)?.message ??
        (res.data as { data?: { message?: string } } | undefined)?.data?.message ??
        "Coupon redeemed successfully.";
      Alert.alert("Coupon redeemed", successMsg);
    } catch (e) {
      Alert.alert("Coupon", e instanceof Error ? e.message : "Could not redeem this coupon.");
    } finally {
      setCouponSubmitting(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const removeMethod = async (id: string) => {
    Alert.alert("Remove card", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await api.fetch<any>("/api/me/payment-methods", { method: "DELETE", body: { id } });
          if (res.error) {
            Alert.alert("Error", res.error.message ?? "Could not remove card. Please try again.");
          } else {
            load();
          }
        },
      },
    ]);
  };

  const addCard = async () => {
    setAddingCard(true);
    try {
      const res = await api.post<{ data?: { authorization_url: string } }>("/api/me/payment-methods/initialize-verification", {
        set_as_default: methods.length === 0,
      });
      const data = res?.data as { authorization_url?: string } | undefined;
      const url = data?.authorization_url;
      if (!url) {
        Alert.alert("Error", res?.error?.message ?? "Could not start card verification.");
        return;
      }
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add card.");
    } finally {
      setAddingCard(false);
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Payment methods</Text>
            <TouchableOpacity
              onPress={() => Alert.alert("Save card", saveCardInfo)}
              accessibilityLabel="Info about saving card"
              style={{ padding: 4 }}
            >
              <Ionicons name="information-circle-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: Colors.gray[600] }}>{saveCardInfo}</Text>
          </View>
          {methods.length === 0 ? (
            <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>No payment methods saved</Text>
          ) : (
            methods.map((m) => (
              <View key={m.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{m.last4 ? `•••• ${m.last4}` : m.type || "Card"}</Text>
                <TouchableOpacity onPress={() => removeMethod(m.id)}>
                  <Text style={{ color: "#B91C1C", fontSize: 14 }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
          <TouchableOpacity
            onPress={addCard}
            disabled={addingCard}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], marginTop: 8 }}
          >
            {addingCard ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontWeight: "500", color: Colors.primary }}>Add card</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Gift cards</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/gift-card-purchase")}>
              <Text style={{ color: Colors.primary, fontWeight: "500" }}>Buy gift card</Text>
            </TouchableOpacity>
          </View>
          {/*
            §Customer-launch (audit 2026-04): gift-card fetch failures
            previously only logged to console, so a failed API silently
            showed "No gift cards yet" with no way to retry. Surface the
            failure inline alongside the list.
          */}
          {giftCardsError && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: "#B91C1C", flex: 1 }} numberOfLines={2}>{giftCardsError}</Text>
              <TouchableOpacity onPress={load} style={{ paddingHorizontal: 12, paddingVertical: 6 }} accessibilityRole="button" accessibilityLabel="Retry loading gift cards">
                <Text style={{ color: Colors.primary, fontWeight: "600" }}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {giftCards.length === 0 ? (
            !giftCardsError && <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>No gift cards yet</Text>
          ) : (
            giftCards.map((g) => (
              <View key={g.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8 }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                  {g.code ? `•••• ${String(g.code).slice(-6)}` : "Gift card"}
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                  Balance: {g.currency} {(g.balance ?? 0).toFixed(2)}
                  {g.expires_at ? ` · Expires ${formatDateSafe(g.expires_at)}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>

        {/*
          §Customer-launch (audit 2026-04): coupon redemption parity with
          web payments page. Customers can type a promo / coupon code,
          see how many active coupons they have, and redeem new ones
          without leaving the app.
        */}
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Coupons</Text>
            <Text style={{ color: Colors.gray[500], fontSize: 12 }}>
              {couponCount === 1 ? "1 active coupon" : `${couponCount} active coupons`}
            </Text>
          </View>
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 12, color: Colors.gray[600], marginBottom: 8 }}>
              Have a promo or referral code? Redeem it here and we&apos;ll apply it to your next eligible order.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TextInput
                value={couponCode}
                onChangeText={setCouponCode}
                placeholder="Enter coupon code"
                placeholderTextColor={Colors.gray[400]}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!couponSubmitting}
                style={{
                  flex: 1,
                  backgroundColor: Colors.white,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: Colors.gray[900],
                  marginRight: 8,
                }}
                accessibilityLabel="Coupon code"
                returnKeyType="done"
                onSubmitEditing={redeemCoupon}
              />
              <TouchableOpacity
                onPress={redeemCoupon}
                disabled={couponSubmitting || !couponCode.trim()}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: 10,
                  backgroundColor: couponSubmitting || !couponCode.trim() ? Colors.gray[300] : Colors.primary,
                  minWidth: 96,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Redeem coupon"
                accessibilityState={{ disabled: couponSubmitting || !couponCode.trim() }}
              >
                {couponSubmitting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={{ color: Colors.white, fontWeight: "600" }}>Redeem</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ScreenFrame>
  );
}
