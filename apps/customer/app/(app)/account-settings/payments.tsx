import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCur =
    bundle?.meta?.tenant_region?.default_currency?.trim() ?? getTenantDefaultCurrency();
  const saveCardInfo = useMemo(() => {
    const example = formatMoney(1, tenantCur);
    return t("customer.paymentsScreen.saveCardExplainer", { example });
  }, [tenantCur, t]);

  const [methods, setMethods] = useState<any[]>([]);
  const [giftCards, setGiftCards] = useState<any[]>([]);
  const [giftCardsError, setGiftCardsError] = useState<string | null>(null);
  const [couponCount, setCouponCount] = useState<number>(0);
  const [couponCode, setCouponCode] = useState("");
  const [couponSubmitting, setCouponSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGiftCardsError(null);
    try {
      // Customer payments: coupon count + redeem parity with web (cards, gift cards, coupons in parallel).
      const [methodsRes, giftRes, couponsRes] = await Promise.all([
        api.get<any>("/api/me/payment-methods"),
        api.get<any>("/api/me/gift-cards").catch((err) => {
          console.warn("Failed to load gift cards:", err);
          return { data: null, error: { message: t("customer.paymentsScreen.loadGiftCardsFailed") } };
        }),
        api.get<any>("/api/me/coupons/count").catch((err) => {
          console.warn("Failed to load coupon count:", err);
          return { data: null };
        }),
      ]);
      if (methodsRes.error) {
        setError(methodsRes.error.message || t("common.error"));
      } else {
        const m = methodsRes.data;
        setMethods(Array.isArray(m) ? m : m?.data ?? []);
      }
      if (giftRes?.error) {
        setGiftCardsError(giftRes.error.message || t("customer.paymentsScreen.loadGiftCardsFailed"));
        setGiftCards([]);
      } else {
        const g = giftRes.data;
        setGiftCards(Array.isArray(g) ? g : g?.gift_cards ?? []);
      }
      const cData = couponsRes?.data as { count?: number; data?: { count?: number } } | undefined;
      const rawCount = cData?.count ?? cData?.data?.count ?? 0;
      setCouponCount(Number.isFinite(rawCount) ? Number(rawCount) : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const redeemCoupon = async () => {
    const code = couponCode.trim();
    if (!code) {
      Alert.alert(t("customer.paymentsScreen.couponTitle"), t("customer.paymentsScreen.enterCouponBody"));
      return;
    }
    setCouponSubmitting(true);
    try {
      const res = await api.post<{ message?: string; data?: { message?: string } }>(
        "/api/me/coupons/redeem",
        { code }
      );
      if (res.error) {
        Alert.alert(t("customer.paymentsScreen.couponTitle"), res.error.message ?? t("customer.paymentsScreen.couponRedeemFailed"));
        return;
      }
      setCouponCode("");
      setCouponCount((prev) => prev + 1);
      const successMsg =
        (res.data as { message?: string; data?: { message?: string } } | undefined)?.message ??
        (res.data as { data?: { message?: string } } | undefined)?.data?.message ??
        t("customer.paymentsScreen.couponRedeemedDefault");
      Alert.alert(t("customer.paymentsScreen.couponRedeemedTitle"), successMsg);
    } catch (e) {
      Alert.alert(t("customer.paymentsScreen.couponTitle"), e instanceof Error ? e.message : t("customer.paymentsScreen.couponRedeemFailed"));
    } finally {
      setCouponSubmitting(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const removeMethod = async (id: string) => {
    Alert.alert(t("customer.paymentsScreen.removeCardTitle"), t("customer.paymentsScreen.removeCardConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("customer.paymentsScreen.remove"),
        style: "destructive",
        onPress: async () => {
          const res = await api.fetch<any>("/api/me/payment-methods", { method: "DELETE", body: { id } });
          if (res.error) {
            Alert.alert(t("common.error"), res.error.message ?? t("customer.paymentsScreen.couldNotRemoveCard"));
          } else {
            load();
          }
        },
      },
    ]);
  };

  const addCard = async () => {
    setAddingCard(true);
    const countBefore = methods.length;
    try {
      const callbackUrl = ExpoLinking.createURL("account-settings/payments");
      const res = await api.post<{ authorization_url?: string; reference?: string; data?: { authorization_url?: string; reference?: string } }>(
        "/api/me/payment-methods/initialize-verification",
        {
          set_as_default: methods.length === 0,
          /** Paystack redirects here after checkout — must be in-app scheme so Safari returns to the customer app (not the web account page). */
          callback_url: callbackUrl,
        },
      );
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message ?? t("customer.paymentsScreen.couldNotStartVerification"));
        return;
      }
      const payload = res.data as { authorization_url?: string; reference?: string; data?: { authorization_url?: string; reference?: string } } | null | undefined;
      const url = payload?.authorization_url ?? payload?.data?.authorization_url;
      let reference = payload?.reference ?? payload?.data?.reference ?? null;
      if (!url) {
        Alert.alert(t("common.error"), t("customer.paymentsScreen.couldNotStartVerification"));
        return;
      }
      const browserResult = await WebBrowser.openAuthSessionAsync(url, callbackUrl);
      if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
        return;
      }
      if (browserResult.type === "success" && browserResult.url) {
        try {
          const parsed = ExpoLinking.parse(browserResult.url);
          const query = parsed.queryParams ?? {};
          if (query.cancelled === "1") return;
          const returnedRef = query.reference ?? query.trxref;
          reference = Array.isArray(returnedRef)
            ? returnedRef[0] ?? reference
            : typeof returnedRef === "string" && returnedRef.trim()
              ? returnedRef.trim()
              : reference;
        } catch {
          // Keep the initialize reference fallback.
        }
      }
      if (reference) {
        await api.get(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`).catch(() => {});
      }

      const MAX_POLL = 12;
      const POLL_MS = 2000;
      for (let i = 0; i < MAX_POLL; i++) {
        const check = await api.get<any>("/api/me/payment-methods");
        if (!check.error) {
          const raw = check.data;
          const list = Array.isArray(raw) ? raw : raw?.data ?? [];
          if (Array.isArray(list) && list.length > countBefore) {
            setMethods(list);
            Alert.alert(
              t("customer.paymentsScreen.cardSavedTitle"),
              t("customer.paymentsScreen.cardSavedBody"),
            );
            return;
          }
        }
        if (i < MAX_POLL - 1) {
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      }

      await load();
      Alert.alert(
        t("customer.paymentsScreen.cardVerificationPendingTitle"),
        t("customer.paymentsScreen.cardVerificationPendingBody"),
      );
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : t("customer.paymentsScreen.couldNotAddCard"));
    } finally {
      setAddingCard(false);
    }
  };

  const couponCountLabel =
    couponCount === 1 ? t("customer.paymentsScreen.oneActiveCoupon") : t("customer.paymentsScreen.nActiveCoupons", { count: couponCount });

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{t("customer.paymentsScreen.methodsHeading")}</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(t("customer.paymentsScreen.saveCardInfoTitle"), saveCardInfo)}
              accessibilityLabel={t("customer.paymentsScreen.infoAboutSavingCard")}
              style={{ padding: 4 }}
            >
              <Ionicons name="information-circle-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: Colors.gray[600] }}>{saveCardInfo}</Text>
          </View>
          {methods.length === 0 ? (
            <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>{t("customer.paymentsScreen.noMethods")}</Text>
          ) : (
            methods.map((m) => (
              <View key={m.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{m.last4 ? `•••• ${m.last4}` : m.type || t("customer.paymentsScreen.card")}</Text>
                <TouchableOpacity onPress={() => removeMethod(m.id)}>
                  <Text style={{ color: "#B91C1C", fontSize: 14 }}>{t("customer.paymentsScreen.remove")}</Text>
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
                <Text style={{ fontWeight: "500", color: Colors.primary }}>{t("customer.paymentsScreen.addCard")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{t("customer.paymentsScreen.giftCards")}</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/gift-card-purchase")}>
              <Text style={{ color: Colors.primary, fontWeight: "500" }}>{t("customer.paymentsScreen.buyGiftCard")}</Text>
            </TouchableOpacity>
          </View>
          {/* Gift-card fetch failures: show inline error + retry instead of silent empty state. */}
          {giftCardsError && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: "#B91C1C", flex: 1 }} numberOfLines={2}>{giftCardsError}</Text>
              <TouchableOpacity onPress={load} style={{ paddingHorizontal: 12, paddingVertical: 6 }} accessibilityRole="button" accessibilityLabel={t("customer.paymentsScreen.retryGiftCardsA11y")}>
                <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("common.retry")}</Text>
              </TouchableOpacity>
            </View>
          )}
          {giftCards.length === 0 ? (
            !giftCardsError && <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>{t("customer.paymentsScreen.noGiftCards")}</Text>
          ) : (
            giftCards.map((g) => {
              const gc = String(g.currency ?? tenantCur);
              const bal = formatMoney(Number(g.balance ?? 0), gc);
              const exp = g.expires_at ? t("customer.paymentsScreen.expiresSuffix", { date: formatDateSafe(g.expires_at) }) : "";
              return (
                <View key={g.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8 }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                    {g.code ? `•••• ${String(g.code).slice(-6)}` : t("customer.paymentsScreen.giftCard")}
                  </Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                    {t("customer.paymentsScreen.giftBalanceExpires", { balance: bal, expires: exp })}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Coupon redemption (parity with web payments). */}
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{t("customer.paymentsScreen.coupons")}</Text>
            <Text style={{ color: Colors.gray[500], fontSize: 12 }}>{couponCountLabel}</Text>
          </View>
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 12, color: Colors.gray[600], marginBottom: 8 }}>{t("customer.paymentsScreen.couponHelp")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TextInput
                value={couponCode}
                onChangeText={setCouponCode}
                placeholder={t("customer.paymentsScreen.couponPlaceholder")}
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
                accessibilityLabel={t("customer.paymentsScreen.couponCodeA11y")}
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
                accessibilityLabel={t("customer.paymentsScreen.redeemA11y")}
                accessibilityState={{ disabled: couponSubmitting || !couponCode.trim() }}
              >
                {couponSubmitting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("customer.paymentsScreen.redeem")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ScreenFrame>
  );
}
