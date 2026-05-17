import { useState, useCallback, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import * as ExpoLinking from "expo-linking";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { APP_URL } from "@/config/public-env";
import { useAuth } from "@/providers/AuthProvider";
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { Ionicons } from "@expo/vector-icons";

const PRESET_AMOUNTS = [100, 200, 500, 1000];

const VERIFY_POLL_ATTEMPTS = 12;
const VERIFY_POLL_INTERVAL_MS = 2000;

async function pollWalletUntilCredited(prevBalance: number): Promise<{ balance: number; credited: boolean }> {
  for (let attempt = 0; attempt < VERIFY_POLL_ATTEMPTS; attempt++) {
    const refreshRes = await api.get<{ wallet?: { balance: number } }>("/api/me/wallet");
    if (!refreshRes.error && refreshRes.data) {
      const d = refreshRes.data as { wallet?: { balance: number } };
      const w = d?.wallet ?? (d as unknown as { balance?: number });
      const bal = Number((w as { balance?: number })?.balance ?? 0);
      if (bal > prevBalance + 0.001) {
        return { balance: bal, credited: true };
      }
    }
    if (attempt < VERIFY_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, VERIFY_POLL_INTERVAL_MS));
    }
  }
  return { balance: prevBalance, credited: false };
}

export default function WalletScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [paymentOption, setPaymentOption] = useState<"new_card" | "saved_card" | "gift_card">("new_card");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [giftCardCode, setGiftCardCode] = useState("");

  const { cards: savedCards, defaultCard, refresh: refreshCards } = useSavedCards(!!user);
  const { payWithSavedCard } = usePaystackPayment();
  const paystackHostedCheckout = useInAppPaystackCheckout();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/wallet");
      if (res.error) setError(res.error.message || t("common.error"));
      else {
        const d = res.data;
        setWallet(d?.wallet ?? d);
        setTxs(d?.transactions ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshCards();
    }, [load, refreshCards]),
  );

  useEffect(() => {
    if (savedCards.length > 0 && defaultCard?.id && !selectedCardId) {
      setSelectedCardId(defaultCard.id);
      if (paymentOption === "new_card") {
        setPaymentOption("saved_card");
      }
    }
  }, [savedCards.length, defaultCard?.id, selectedCardId, paymentOption]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      await refreshCards();
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshCards]);

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? getTenantDefaultCurrency();
  const balanceLabel = formatMoney(Number(balance), currency);

  const startTopup = async () => {
    if (paymentOption === "gift_card") {
      await redeemGiftCard();
      return;
    }

    const amount = Number(topupAmount?.replace(/,/g, "."));
    if (!amount || amount <= 0) {
      Alert.alert(t("customer.walletScreen.invalidAmountTitle"), t("customer.walletScreen.invalidAmountBody"));
      return;
    }
    
    if (paymentOption === "saved_card" && !selectedCardId) {
      Alert.alert(t("common.error"), "Please select a saved card.");
      return;
    }

    setToppingUp(true);
    try {
      const returnUrl = ExpoLinking.createURL("account-settings/wallet");
      const res = await api.post<{
        payment_url?: string;
        topup_id?: string;
        paystack_reference?: string;
      }>("/api/me/wallet/topup", { amount, callback_url: returnUrl });
      
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message || t("customer.walletScreen.failedStartTopup"));
        return;
      }
      
      const topupId = res.data?.topup_id;
      const paymentUrl = res.data?.payment_url;
      const paystackRef = res.data?.paystack_reference?.trim();
      const balanceBefore = balance;

      let finalPaystackRef = paystackRef;

      if (paymentOption === "saved_card") {
        const chargeRes = await payWithSavedCard({
          payment_method_id: selectedCardId!,
          amount,
          email: user!.email!,
          currency,
          metadata: {
            wallet_topup_id: topupId,
            amount,
            currency,
            user_id: user!.id,
          },
        });

        if (!chargeRes.success) {
          throw new Error("Failed to charge saved card");
        }
        finalPaystackRef = chargeRes.reference;
      } else {
        if (!paymentUrl) {
          Alert.alert(t("common.error"), t("customer.walletScreen.noPaymentLink"));
          return;
        }
        const appBase = (APP_URL ?? "").replace(/\/$/, "");
        await paystackHostedCheckout.waitForCheckout(paymentUrl, {
          title: t("customer.walletScreen.topUpSecureTitle", "Wallet top-up") as string,
          returnUrl,
          matchSuccess: (rawUrl) => {
            try {
              if (!rawUrl.startsWith("http") || !appBase) return false;
              const u = new URL(rawUrl);
              if (!u.href.startsWith(appBase)) return false;
              if (u.searchParams.get("cancelled") === "1") return false;
              return u.pathname.includes("/checkout/success") && u.searchParams.get("payment_type") === "wallet_topup";
            } catch {
              return false;
            }
          },
          matchCancel: (rawUrl) => {
            try {
              const u = new URL(rawUrl);
              return u.searchParams.get("topup_cancelled") === "1" || u.searchParams.get("cancelled") === "1";
            } catch {
              return false;
            }
          },
        });
      }

      setTopupAmount("");

      if (finalPaystackRef) {
        const verifyRes = await api.get(`/api/paystack/verify?reference=${encodeURIComponent(finalPaystackRef)}`);
        if (verifyRes.error) {
          console.warn("[Wallet] Paystack verify after top-up:", verifyRes.error);
        }
      }
      
      const polled = await pollWalletUntilCredited(balanceBefore);
      const refreshRes = await api.get<any>("/api/me/wallet");
      if (!refreshRes.error) {
        const d = refreshRes.data;
        const newWallet = d?.wallet ?? d;
        setWallet(newWallet);
        setTxs(d?.transactions ?? []);
        const newBalance = Number(newWallet?.balance ?? polled.balance);
        if (polled.credited || newBalance > balanceBefore + 0.001) {
          Alert.alert(t("customer.walletScreen.topUpSuccessTitle"), t("customer.walletScreen.topUpSuccessBody"));
        } else {
          Alert.alert(t("customer.walletScreen.paymentPendingTitle"), t("customer.walletScreen.paymentPendingBody"));
        }
      }
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : t("customer.walletScreen.topUpFailed"));
    } finally {
      setToppingUp(false);
    }
  };

  const redeemGiftCard = async () => {
    if (!giftCardCode.trim()) {
      Alert.alert(t("common.error"), "Please enter a gift card code.");
      return;
    }
    setToppingUp(true);
    try {
      const res = await api.post<{ amount: number; currency: string; message: string }>(
        "/api/me/wallet/redeem-gift-card",
        { code: giftCardCode }
      );
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message || "Failed to redeem gift card");
      } else {
        Alert.alert("Success", res.data?.message || "Gift card redeemed to wallet successfully");
        setGiftCardCode("");
        await load();
      }
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : "Failed to redeem gift card");
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <>
    <ScreenFrame loading={loading} error={error} onRetry={load} refreshing={refreshing} onRefresh={handleRefresh}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 24, alignItems: "center" }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{t("customer.walletScreen.balanceLabel")}</Text>
          <Text style={{ fontSize: 30, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>{balanceLabel}</Text>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>Top Up Option</Text>
          
          <View style={{ flexDirection: "row", marginBottom: 16 }}>
            {savedCards.length > 0 && (
              <TouchableOpacity
                onPress={() => setPaymentOption("saved_card")}
                style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: paymentOption === "saved_card" ? Colors.primary : Colors.gray[200], borderRadius: 12, backgroundColor: paymentOption === "saved_card" ? "#FDF2F8" : Colors.white, marginRight: 8, alignItems: "center" }}
              >
                <Ionicons name="card-outline" size={20} color={paymentOption === "saved_card" ? Colors.primary : Colors.gray[500]} />
                <Text style={{ marginTop: 4, fontSize: 12, fontWeight: "500", color: paymentOption === "saved_card" ? Colors.primary : Colors.gray[700] }}>Saved Card</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setPaymentOption("new_card")}
              style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: paymentOption === "new_card" ? Colors.primary : Colors.gray[200], borderRadius: 12, backgroundColor: paymentOption === "new_card" ? "#FDF2F8" : Colors.white, marginRight: 8, alignItems: "center" }}
            >
              <Ionicons name="add-circle-outline" size={20} color={paymentOption === "new_card" ? Colors.primary : Colors.gray[500]} />
              <Text style={{ marginTop: 4, fontSize: 12, fontWeight: "500", color: paymentOption === "new_card" ? Colors.primary : Colors.gray[700] }}>New Card</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPaymentOption("gift_card")}
              style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: paymentOption === "gift_card" ? Colors.primary : Colors.gray[200], borderRadius: 12, backgroundColor: paymentOption === "gift_card" ? "#FDF2F8" : Colors.white, alignItems: "center" }}
            >
              <Ionicons name="gift-outline" size={20} color={paymentOption === "gift_card" ? Colors.primary : Colors.gray[500]} />
              <Text style={{ marginTop: 4, fontSize: 12, fontWeight: "500", color: paymentOption === "gift_card" ? Colors.primary : Colors.gray[700] }}>Gift Card</Text>
            </TouchableOpacity>
          </View>

          {paymentOption === "gift_card" ? (
            <View>
              <TextInput
                value={giftCardCode}
                onChangeText={setGiftCardCode}
                placeholder="Enter gift card code"
                style={{ backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900], marginBottom: 8 }}
                placeholderTextColor={Colors.gray[400]}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                onPress={startTopup}
                disabled={toppingUp || !giftCardCode.trim()}
                style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: (!giftCardCode.trim() || toppingUp) ? 0.7 : 1 }}
              >
                {toppingUp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: Colors.white, fontWeight: "600" }}>Redeem Gift Card</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {paymentOption === "saved_card" && savedCards.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  {savedCards.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setSelectedCardId(c.id)}
                      style={{ flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, borderColor: selectedCardId === c.id ? Colors.primary : Colors.gray[200], borderRadius: 12, marginBottom: 8, backgroundColor: Colors.white }}
                    >
                      <Ionicons name="card" size={24} color={selectedCardId === c.id ? Colors.primary : Colors.gray[400]} />
                      <Text style={{ marginLeft: 12, fontSize: 15, color: Colors.gray[900], flex: 1 }}>•••• {c.last4} ({c.brand})</Text>
                      {selectedCardId === c.id && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
                {PRESET_AMOUNTS.map((a) => (
                  <TouchableOpacity
                    key={a}
                    onPress={() => setTopupAmount(String(a))}
                    style={{ backgroundColor: Colors.white, borderWidth: 1, borderColor: topupAmount === String(a) ? Colors.primary : Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}
                  >
                    <Text style={{ color: topupAmount === String(a) ? Colors.primary : Colors.gray[900], fontWeight: "500" }}>{formatMoney(a, currency)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={topupAmount}
                onChangeText={setTopupAmount}
                placeholder={t("customer.walletScreen.amountPlaceholder", { currency })}
                keyboardType="decimal-pad"
                style={{ backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: Colors.gray[900], marginBottom: 8 }}
                placeholderTextColor={Colors.gray[400]}
              />
              <TouchableOpacity
                onPress={startTopup}
                disabled={toppingUp || !topupAmount.trim()}
                style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: (!topupAmount.trim() || toppingUp) ? 0.7 : 1 }}
              >
                {toppingUp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("customer.walletScreen.topUpWithCard")}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{t("customer.walletScreen.recentTransactions")}</Text>
          {txs.length === 0 ? (
            <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>{t("customer.walletScreen.noTransactions")}</Text>
          ) : (
            txs.slice(0, 10).map((row) => (
              <View key={row.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: Colors.gray[900] }}>{row.description || row.type || t("customer.walletScreen.transactionFallback")}</Text>
                <Text style={{ color: Number(row.amount) >= 0 ? "#16a34a" : "#B91C1C" }}>
                  {Number(row.amount) >= 0 ? "+" : ""}{formatMoney(Math.abs(Number(row.amount)), currency)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenFrame>
    {paystackHostedCheckout.modal}
    </>
  );
}
