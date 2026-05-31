import { useState, useCallback, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ExpoLinking from "expo-linking";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { safeWarn } from "@/lib/payments/safeLog";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { APP_URL } from "@/config/public-env";
import { useAuth } from "@/providers/AuthProvider";
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { Ionicons } from "@expo/vector-icons";

const PRESET_AMOUNTS = [100, 200, 500, 1000];

// Server now credits synchronously on verify (and on saved-card charge), so a
// short fallback poll is enough to bridge any webhook race instead of the old
// 24s single-spinner wait.
const VERIFY_POLL_ATTEMPTS = 5;
const VERIFY_POLL_INTERVAL_MS = 1500;

type WalletSnapshot = { wallet: any; transactions: any[]; balance: number };

async function fetchWalletSnapshot(): Promise<WalletSnapshot | null> {
  const res = await api.get<any>("/api/me/wallet");
  if (res.error || !res.data) return null;
  const d = res.data;
  const w = d?.wallet ?? d;
  return {
    wallet: w,
    transactions: d?.transactions ?? [],
    balance: Number((w as { balance?: number })?.balance ?? 0),
  };
}

async function pollWalletUntilCredited(
  prevBalance: number,
): Promise<{ snapshot: WalletSnapshot | null; credited: boolean }> {
  let last: WalletSnapshot | null = null;
  for (let attempt = 0; attempt < VERIFY_POLL_ATTEMPTS; attempt++) {
    const snap = await fetchWalletSnapshot();
    if (snap) {
      last = snap;
      if (snap.balance > prevBalance + 0.001) {
        return { snapshot: snap, credited: true };
      }
    }
    if (attempt < VERIFY_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, VERIFY_POLL_INTERVAL_MS));
    }
  }
  return { snapshot: last, credited: false };
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
  const [topupStatus, setTopupStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const [paymentOption, setPaymentOption] = useState<"new_card" | "saved_card" | "gift_card">("new_card");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [ownedGiftCards, setOwnedGiftCards] = useState<any[]>([]);

  const params = useLocalSearchParams<{ giftCode?: string }>();

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

  const loadGiftCards = useCallback(async () => {
    const res = await api
      .get<{ gift_cards?: any[] }>("/api/me/gift-cards")
      .catch(() => null);
    const list = res?.data?.gift_cards;
    if (Array.isArray(list)) {
      setOwnedGiftCards(list.filter((g) => Number(g?.balance ?? 0) > 0 && g?.code));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshCards();
      void loadGiftCards();
    }, [load, refreshCards, loadGiftCards]),
  );

  useEffect(() => {
    const incoming = typeof params.giftCode === "string" ? params.giftCode.trim() : "";
    if (incoming) {
      setPaymentOption("gift_card");
      setGiftCardCode(incoming);
    }
  }, [params.giftCode]);

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
    setTopupStatus(t("customer.walletScreen.statusStarting", "Starting secure payment…") as string);
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
      let cancelled = false;

      if (paymentOption === "saved_card") {
        setTopupStatus(t("customer.walletScreen.statusCharging", "Charging your saved card…") as string);
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
          throw new Error(
            t("customer.walletScreen.savedCardChargeFailed", "We couldn't charge your saved card. Please try another card.") as string,
          );
        }
        finalPaystackRef = chargeRes.reference;
      } else {
        if (!paymentUrl) {
          Alert.alert(t("common.error"), t("customer.walletScreen.noPaymentLink"));
          return;
        }
        setTopupStatus(t("customer.walletScreen.statusCheckout", "Complete payment in the secure window…") as string);
        const appBase = (APP_URL ?? "").replace(/\/$/, "");
        const outcome = await paystackHostedCheckout.waitForCheckout(paymentUrl, {
          title: t("customer.walletScreen.topUpSecureTitle", "Wallet top-up") as string,
          returnUrl,
          matchSuccess: (rawUrl) => {
            try {
              // Mobile callback is the customer:// deep link; web preview is the
              // https success page. Accept either as a success signal.
              if (returnUrl && rawUrl.startsWith(returnUrl) && rawUrl.includes("payment_type=wallet_topup")) {
                return !rawUrl.includes("topup_cancelled=1") && !rawUrl.includes("cancelled=1");
              }
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
        cancelled = outcome?.outcome === "cancel";
      }

      if (cancelled) {
        setTopupStatus(null);
        Alert.alert(
          t("customer.walletScreen.topUpCancelledTitle", "Top-up cancelled") as string,
          t("customer.walletScreen.topUpCancelledBody", "No payment was taken. You can try again anytime.") as string,
        );
        return;
      }

      setTopupAmount("");
      setTopupStatus(t("customer.walletScreen.statusConfirming", "Confirming your payment…") as string);

      let verifiedSuccess = false;
      if (finalPaystackRef) {
        const verifyResult = await verifyPaystackWithRetry(finalPaystackRef);
        verifiedSuccess = verifyResult.status === "success";
        if (verifyResult.status === "failed") {
          safeWarn("Wallet top-up verify reported failed", { message: verifyResult.errorMessage });
          throw new Error(
            t("customer.walletScreen.paymentDeclined", "Your payment was declined. No funds were taken.") as string,
          );
        }
      }

      setTopupStatus(t("customer.walletScreen.statusUpdating", "Updating your balance…") as string);

      // The server credits the wallet synchronously on a successful verify/charge.
      // If verify already confirmed success, one fresh read should reflect it;
      // otherwise fall back to a short poll to bridge any webhook race.
      let snapshot = await fetchWalletSnapshot();
      let credited = !!snapshot && snapshot.balance > balanceBefore + 0.001;
      if (!credited) {
        const polled = await pollWalletUntilCredited(balanceBefore);
        snapshot = polled.snapshot ?? snapshot;
        credited = polled.credited;
      }

      if (snapshot) {
        setWallet(snapshot.wallet);
        setTxs(snapshot.transactions);
      }

      if (credited) {
        Alert.alert(
          t("customer.walletScreen.topUpSuccessTitle"),
          t("customer.walletScreen.topUpSuccessBody"),
        );
      } else if (verifiedSuccess) {
        // Payment confirmed by Paystack but the credit hasn't surfaced in this
        // read yet — reassure rather than alarm; the balance will reflect shortly.
        Alert.alert(
          t("customer.walletScreen.topUpSuccessTitle"),
          t(
            "customer.walletScreen.topUpConfirmedSyncingBody",
            "Payment confirmed. Your balance will update momentarily — pull to refresh if needed.",
          ) as string,
        );
      } else {
        Alert.alert(
          t("customer.walletScreen.paymentPendingTitle"),
          t("customer.walletScreen.paymentPendingBody"),
        );
      }
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : t("customer.walletScreen.topUpFailed"));
    } finally {
      setToppingUp(false);
      setTopupStatus(null);
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
        await Promise.all([load(), loadGiftCards()]);
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
              <Text style={{ fontSize: 12, color: Colors.gray[600], marginBottom: 12 }}>
                {t(
                  "customer.walletScreen.giftRedeemHelp",
                  "Enter a code you bought or that someone shared with you — the full balance is added to your wallet instantly.",
                )}
              </Text>
              {ownedGiftCards.length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: Colors.gray[600], marginBottom: 8 }}>
                    {t("customer.walletScreen.yourGiftCards", "Your gift cards")}
                  </Text>
                  {ownedGiftCards.map((g) => {
                    const code = String(g.code ?? "").trim();
                    const selected = giftCardCode.trim() === code;
                    return (
                      <TouchableOpacity
                        key={g.id}
                        onPress={() => setGiftCardCode(code)}
                        style={{ flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, borderColor: selected ? Colors.primary : Colors.gray[200], borderRadius: 12, marginBottom: 8, backgroundColor: selected ? "#FDF2F8" : Colors.white }}
                      >
                        <Ionicons name="gift" size={20} color={selected ? Colors.primary : Colors.gray[400]} />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>
                            {formatMoney(Number(g.balance ?? 0), String(g.currency ?? currency))}
                          </Text>
                          <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                            •••• {code.slice(-6)}
                          </Text>
                        </View>
                        {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
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
                  {savedCards.map((c) => {
                    const expiry =
                      c.expiry_label ??
                      (c.expiry_month && c.expiry_year
                        ? `${String(c.expiry_month).padStart(2, "0")}/${String(c.expiry_year).slice(-2)}`
                        : null);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setSelectedCardId(c.id)}
                        style={{ flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, borderColor: selectedCardId === c.id ? Colors.primary : Colors.gray[200], borderRadius: 12, marginBottom: 8, backgroundColor: Colors.white }}
                      >
                        <Ionicons name="card" size={24} color={selectedCardId === c.id ? Colors.primary : Colors.gray[400]} />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ fontSize: 15, color: Colors.gray[900] }}>•••• {c.last4} ({c.brand})</Text>
                          {expiry ? (
                            <Text style={{ fontSize: 11, color: Colors.gray[500], marginTop: 2 }}>
                              Expires {expiry}
                            </Text>
                          ) : null}
                        </View>
                        {selectedCardId === c.id && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => router.push("/account-settings/payments")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ paddingVertical: 6, alignSelf: "flex-start" }}
                    accessibilityRole="link"
                    accessibilityLabel="Manage saved cards"
                  >
                    <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: "600" }}>
                      Manage saved cards
                    </Text>
                  </TouchableOpacity>
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
              {toppingUp && topupStatus ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={{ marginLeft: 8, fontSize: 13, color: Colors.gray[600] }}>{topupStatus}</Text>
                </View>
              ) : null}
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
