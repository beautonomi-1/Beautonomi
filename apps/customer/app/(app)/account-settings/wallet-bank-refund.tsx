import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";

type BankAccount = {
  id: string;
  bank_name?: string | null;
  account_number_last4?: string | null;
  is_primary?: boolean;
};

type RefundSettings = {
  enabled?: boolean;
  min_amount?: number;
  max_amount_per_request?: number | null;
  fee_type?: "fixed" | "percentage";
  fee_value?: number;
  sla_business_days?: number;
};

type OpenRequest = {
  id: string;
  request_number: string;
  status: "pending" | "approved";
  amount: number;
  net_amount: number;
  currency?: string;
};

function feeFor(amount: number, s: RefundSettings): number {
  const value = Math.max(0, Number(s.fee_value ?? 0));
  const raw = s.fee_type === "percentage" ? (amount * value) / 100 : value;
  return Math.round(Math.min(raw, amount) * 100) / 100;
}

export default function WalletBankRefundScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [eligible, setEligible] = useState(0);
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState("ZAR");
  const [settings, setSettings] = useState<RefundSettings>({});
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef(`mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [refundsRes, accountsRes, walletRes] = await Promise.all([
        api.get<{ eligible_amount?: number; settings?: RefundSettings; open_request?: OpenRequest | null }>(
          "/api/me/wallet/bank-refunds?limit=1",
        ),
        api.get<BankAccount[]>("/api/me/bank-accounts"),
        api.get<{ wallet?: { balance?: number; currency?: string }; balance?: number; currency?: string }>(
          "/api/me/wallet",
        ),
      ]);
      if (!refundsRes.data?.settings?.enabled) {
        Alert.alert(t("common.error"), t("customer.walletBankRefund.notEnabled"));
        router.back();
        return;
      }
      setSettings(refundsRes.data.settings);
      setEligible(Number(refundsRes.data.eligible_amount ?? 0));
      setOpenRequest(refundsRes.data.open_request ?? null);
      const w = walletRes.data?.wallet ?? walletRes.data;
      setBalance(Number(w?.balance ?? 0));
      if (w?.currency) setCurrency(w.currency);
      const list = Array.isArray(accountsRes.data) ? accountsRes.data : [];
      setAccounts(list);
      setSelectedAccountId((prev) =>
        prev && list.some((a) => a.id === prev) ? prev : list.find((a) => a.is_primary)?.id ?? list[0]?.id ?? null,
      );
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (step === 2) void load();
    }, [step, load]),
  );

  const parsedAmount = Number(amount.replace(",", "."));
  const fee = useMemo(
    () => (Number.isFinite(parsedAmount) && parsedAmount > 0 ? feeFor(parsedAmount, settings) : 0),
    [parsedAmount, settings],
  );

  const submit = async () => {
    if (!selectedAccountId || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > eligible) {
      Alert.alert(t("common.error"), t("customer.walletBankRefund.invalidAmount"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/api/me/wallet/bank-refunds", {
        customer_bank_account_id: selectedAccountId,
        amount: parsedAmount,
        idempotency_key: idempotencyKey.current,
      });
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message ?? t("customer.walletBankRefund.failed"));
        return;
      }
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOpen = async () => {
    if (!openRequest) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/api/me/wallet/bank-refunds/${openRequest.id}/cancel`, {});
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message ?? t("customer.walletBankRefund.failed"));
        return;
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const secondaryText = { color: Colors.gray[600], marginBottom: 12, lineHeight: 20 } as const;

  return (
    <ScreenFrame loading={loading} onRetry={load}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {openRequest && step !== 3 ? (
          <View style={{ padding: 14, borderRadius: 12, backgroundColor: Colors.gray[50], marginBottom: 16 }}>
            <Text style={{ fontWeight: "600", marginBottom: 6 }}>
              {t("customer.walletBankRefund.openRequest", { number: openRequest.request_number })}
            </Text>
            <Text style={secondaryText}>
              {formatCurrency(Number(openRequest.net_amount), openRequest.currency ?? currency)}
            </Text>
            {openRequest.status === "pending" ? (
              <TouchableOpacity disabled={submitting} onPress={() => void cancelOpen()}>
                <Text style={{ color: Colors.primary, fontWeight: "600" }}>
                  {t("customer.walletBankRefund.cancelRequest")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
              {t("customer.walletBankRefund.retentionTitle")}
            </Text>
            <Text style={secondaryText}>
              {t("customer.walletBankRefund.retentionBody", { amount: formatCurrency(balance, currency) })}
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ backgroundColor: Colors.primary, padding: 14, borderRadius: 12, marginBottom: 10 }}
            >
              <Text style={{ color: "#fff", textAlign: "center", fontWeight: "700" }}>
                {t("customer.walletBankRefund.keepInWallet")}
              </Text>
            </TouchableOpacity>
            {!openRequest ? (
              <TouchableOpacity onPress={() => setStep(2)} style={{ padding: 12 }}>
                <Text style={{ textAlign: "center", color: Colors.gray[600] }}>
                  {t("customer.walletBankRefund.continueToBank")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 4 }}>
              {t("customer.walletBankRefund.eligibleLabel", { amount: formatCurrency(eligible, currency) })}
            </Text>
            <Text style={secondaryText}>{t("customer.walletBankRefund.eligibleHint")}</Text>

            {eligible <= 0 ? (
              <Text style={secondaryText}>{t("customer.walletBankRefund.noneEligible")}</Text>
            ) : (
              <>
                <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
                  {t("customer.walletBankRefund.amountLabel")}
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder={formatCurrency(eligible, currency)}
                  style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 10, padding: 12, marginBottom: 8 }}
                />
                {parsedAmount > 0 ? (
                  <Text style={secondaryText}>
                    {t("customer.walletBankRefund.feeLine", {
                      fee: formatCurrency(fee, currency),
                      net: formatCurrency(Math.max(0, parsedAmount - fee), currency),
                    })}
                  </Text>
                ) : null}

                {accounts.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setSelectedAccountId(a.id)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: selectedAccountId === a.id ? Colors.primary : Colors.gray[200],
                      marginBottom: 8,
                    }}
                  >
                    <Text>
                      {a.bank_name ?? t("customer.bankAccounts.bankLabel")} •••• {a.account_number_last4 ?? "****"}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => router.push("/(app)/account-settings/bank-accounts" as never)}
                  style={{ marginBottom: 12, paddingVertical: 6 }}
                >
                  <Text style={{ color: Colors.primary }}>{t("customer.walletBankRefund.addBank")}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={submitting || !selectedAccountId}
                  onPress={() => void submit()}
                  style={{
                    backgroundColor: Colors.primary,
                    padding: 14,
                    borderRadius: 12,
                    marginTop: 8,
                    opacity: !selectedAccountId ? 0.5 : 1,
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", textAlign: "center", fontWeight: "700" }}>
                      {t("customer.walletBankRefund.submit")}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </>
        ) : null}

        {step === 3 ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
              {t("customer.walletBankRefund.submittedTitle")}
            </Text>
            <Text style={{ color: Colors.gray[600], textAlign: "center" }}>
              {t("customer.walletBankRefund.submittedBody", { days: settings.sla_business_days ?? 5 })}
            </Text>
            <TouchableOpacity
              onPress={() => router.replace("/(app)/account-settings/wallet" as never)}
              style={{ marginTop: 20, padding: 12 }}
            >
              <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("common.done")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </ScreenFrame>
  );
}
