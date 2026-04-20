import { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

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
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? getTenantDefaultCurrency();
  const balanceLabel = formatMoney(Number(balance), currency);

  const startTopup = async () => {
    const amount = Number(topupAmount?.replace(/,/g, "."));
    if (!amount || amount <= 0) {
      Alert.alert(t("customer.walletScreen.invalidAmountTitle"), t("customer.walletScreen.invalidAmountBody"));
      return;
    }
    setToppingUp(true);
    try {
      const res = await api.post<{
        payment_url?: string;
        topup_id?: string;
        paystack_reference?: string;
      }>("/api/me/wallet/topup", { amount });
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message || t("customer.walletScreen.failedStartTopup"));
        return;
      }
      const paymentUrl = res.data?.payment_url;
      if (!paymentUrl) {
        Alert.alert(t("common.error"), t("customer.walletScreen.noPaymentLink"));
        return;
      }
      const paystackRef = res.data?.paystack_reference?.trim();
      setTopupAmount("");
      const balanceBefore = balance;
      await WebBrowser.openBrowserAsync(paymentUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      if (paystackRef) {
        const verifyRes = await api.get(`/api/paystack/verify?reference=${encodeURIComponent(paystackRef)}`);
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

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load} refreshing={refreshing} onRefresh={handleRefresh}>
      <View>
        <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 24, alignItems: "center" }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{t("customer.walletScreen.balanceLabel")}</Text>
          <Text style={{ fontSize: 30, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>{balanceLabel}</Text>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{t("customer.walletScreen.topUp")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
            {PRESET_AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => setTopupAmount(String(a))}
                style={{ backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}
              >
                <Text style={{ color: Colors.gray[900], fontWeight: "500" }}>{formatMoney(a, currency)}</Text>
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
            style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
          >
            {toppingUp ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("customer.walletScreen.topUpWithCard")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View>
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
      </View>
    </ScreenFrame>
  );
}
