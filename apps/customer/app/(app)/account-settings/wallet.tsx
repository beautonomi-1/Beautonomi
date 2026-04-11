import { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

const PRESET_AMOUNTS = [100, 200, 500, 1000];

export default function WalletScreen() {
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/wallet");
      if (res.error) setError(res.error.message || "Failed to load");
      else {
        const d = res.data;
        setWallet(d?.wallet ?? d);
        setTxs(d?.transactions ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // useFocusEffect covers both initial mount and re-focus — no need for a separate useEffect
  useFocusEffect(useCallback(() => { load(); }, []));

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? getTenantDefaultCurrency();

  const startTopup = async () => {
    const amount = Number(topupAmount?.replace(/,/g, "."));
    if (!amount || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount to top up.");
      return;
    }
    setToppingUp(true);
    try {
      const res = await api.post<{ payment_url?: string; topup_id?: string }>("/api/me/wallet/topup", { amount });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to start top-up");
        return;
      }
      const paymentUrl = res.data?.payment_url;
      if (!paymentUrl) {
        Alert.alert("Error", "No payment link received");
        return;
      }
      setTopupAmount("");
      const balanceBefore = balance;
      await WebBrowser.openBrowserAsync(paymentUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      const refreshRes = await api.get<any>("/api/me/wallet");
      if (!refreshRes.error) {
        const d = refreshRes.data;
        const newWallet = d?.wallet ?? d;
        setWallet(newWallet);
        setTxs(d?.transactions ?? []);
        const newBalance = newWallet?.balance ?? 0;
        if (newBalance > balanceBefore) {
          Alert.alert("Top-up successful", "Your wallet has been topped up.");
        }
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View>
        <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 24, alignItems: "center" }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Wallet balance</Text>
          <Text style={{ fontSize: 30, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>{currency} {Number(balance).toFixed(2)}</Text>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Top up</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
            {PRESET_AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => setTopupAmount(String(a))}
                style={{ backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}
              >
                <Text style={{ color: Colors.gray[900], fontWeight: "500" }}>{currency} {a}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={topupAmount}
            onChangeText={setTopupAmount}
            placeholder={`Amount (${currency})`}
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
              <Text style={{ color: Colors.white, fontWeight: "600" }}>Top up with card</Text>
            )}
          </TouchableOpacity>
        </View>

        <View>
          <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Recent transactions</Text>
          {txs.length === 0 ? (
            <Text style={{ color: Colors.gray[500], paddingVertical: 16 }}>No transactions yet</Text>
          ) : (
            txs.slice(0, 10).map((t) => (
              <View key={t.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: Colors.gray[900] }}>{t.description || t.type || "Transaction"}</Text>
                <Text style={{ color: Number(t.amount) >= 0 ? "#16a34a" : "#B91C1C" }}>
                  {Number(t.amount) >= 0 ? "+" : ""}{currency} {Math.abs(Number(t.amount)).toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScreenFrame>
  );
}
