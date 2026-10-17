import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";

type BankAccount = {
  id: string;
  bank_name?: string | null;
  account_name: string;
  account_number_last4: string;
  is_primary: boolean;
  verified?: boolean;
};

type Bank = { code: string; name: string };

const inputStyle = {
  borderWidth: 1,
  borderColor: Colors.gray[200],
  borderRadius: 10,
  padding: 12,
  marginBottom: 10,
} as const;

export default function BankAccountsScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankQuery, setBankQuery] = useState("");
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verificationAvailable, setVerificationAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<BankAccount[]>("/api/me/bank-accounts");
      const list = Array.isArray(res.data) ? res.data : [];
      setAccounts(list);
      setShowForm(list.length === 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showForm || banks.length > 0) return;
    void (async () => {
      const res = await api.get<Bank[]>("/api/public/banks");
      if (res.error || !Array.isArray(res.data)) {
        Alert.alert(t("common.error"), t("customer.bankAccounts.failedLoadBanks"));
        return;
      }
      setBanks(res.data.map((b) => ({ code: String(b.code), name: String(b.name) })));
    })();
  }, [showForm, banks.length, t]);

  const filteredBanks = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    const list = q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
    return list.slice(0, 12);
  }, [banks, bankQuery]);

  const resetForm = () => {
    setBank(null);
    setBankQuery("");
    setAccountNumber("");
    setAccountName("");
    setVerifiedName(null);
  };

  const verify = async () => {
    if (!bank || accountNumber.replace(/\s/g, "").length < 8) {
      Alert.alert(t("common.error"), t("customer.bankAccounts.fillAllFields"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ account_name: string | null; verified: boolean; verification_available?: boolean }>(
        "/api/me/bank-accounts/verify",
        { account_number: accountNumber.replace(/\s/g, ""), bank_code: bank.code },
      );
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message ?? t("common.error"));
        return;
      }
      if (res.data?.verified && res.data.account_name) {
        setVerifiedName(res.data.account_name);
        setAccountName(res.data.account_name);
      } else if (res.data?.verification_available === false) {
        setVerificationAvailable(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const name = (verifiedName ?? accountName).trim();
    if (!bank || accountNumber.replace(/\s/g, "").length < 8 || !name) {
      Alert.alert(t("common.error"), t("customer.bankAccounts.fillAllFields"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/api/me/bank-accounts", {
        account_number: accountNumber.replace(/\s/g, ""),
        bank_code: bank.code,
        bank_name: bank.name,
        account_name: name,
      });
      if (res.error) {
        Alert.alert(t("common.error"), res.error.message ?? t("common.error"));
        return;
      }
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = (account: BankAccount) => {
    Alert.alert(t("customer.bankAccounts.removeConfirmTitle"), t("customer.bankAccounts.removeConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("customer.bankAccounts.remove"),
        style: "destructive",
        onPress: async () => {
          const res = await api.delete(`/api/me/bank-accounts/${account.id}`);
          if (res.error) Alert.alert(t("common.error"), res.error.message ?? t("common.error"));
          await load();
        },
      },
    ]);
  };

  const makePrimary = async (account: BankAccount) => {
    const res = await api.patch(`/api/me/bank-accounts/${account.id}`, { is_primary: true });
    if (res.error) Alert.alert(t("common.error"), res.error.message ?? t("common.error"));
    await load();
  };

  return (
    <ScreenFrame loading={loading} onRetry={load}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: Colors.gray[600], marginBottom: 16, lineHeight: 20 }}>
          {t("customer.bankAccounts.intro")}
        </Text>

        {accounts.length === 0 && !showForm ? (
          <Text style={{ color: Colors.gray[600], marginBottom: 12 }}>{t("customer.bankAccounts.empty")}</Text>
        ) : null}

        {accounts.map((a) => (
          <View
            key={a.id}
            style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], marginBottom: 10 }}
          >
            <Text style={{ fontWeight: "600" }}>
              {a.bank_name ?? t("customer.bankAccounts.bankLabel")} •••• {a.account_number_last4}
            </Text>
            <Text style={{ color: Colors.gray[600], marginTop: 2 }}>{a.account_name}</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
              {a.is_primary ? (
                <Text style={{ color: Colors.gray[600] }}>{t("customer.bankAccounts.primary")}</Text>
              ) : (
                <TouchableOpacity onPress={() => void makePrimary(a)}>
                  <Text style={{ color: Colors.primary }}>{t("customer.bankAccounts.makePrimary")}</Text>
                </TouchableOpacity>
              )}
              {a.verified ? (
                <Text style={{ color: Colors.gray[600] }}>{t("customer.bankAccounts.verifiedBadge")}</Text>
              ) : null}
              <TouchableOpacity onPress={() => remove(a)}>
                <Text style={{ color: "#B91C1C" }}>{t("customer.bankAccounts.remove")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {!showForm ? (
          <TouchableOpacity onPress={() => setShowForm(true)} style={{ paddingVertical: 12 }}>
            <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("customer.bankAccounts.addAnother")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontWeight: "600", marginBottom: 6 }}>{t("customer.bankAccounts.bankLabel")}</Text>
            {bank ? (
              <TouchableOpacity onPress={() => setBank(null)} style={inputStyle}>
                <Text>{bank.name}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  value={bankQuery}
                  onChangeText={setBankQuery}
                  placeholder={t("customer.bankAccounts.searchBanks")}
                  style={inputStyle}
                />
                {banks.length === 0 ? <ActivityIndicator style={{ marginBottom: 10 }} /> : null}
                {filteredBanks.map((b) => (
                  <TouchableOpacity
                    key={`${b.code}-${b.name}`}
                    onPress={() => {
                      setBank(b);
                      setVerifiedName(null);
                    }}
                    style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
                  >
                    <Text>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={{ fontWeight: "600", marginTop: 10, marginBottom: 6 }}>
              {t("customer.bankAccounts.accountNumberLabel")}
            </Text>
            <TextInput
              value={accountNumber}
              onChangeText={(v) => {
                setAccountNumber(v);
                setVerifiedName(null);
              }}
              keyboardType="number-pad"
              style={inputStyle}
            />

            {verifiedName ? (
              <Text style={{ color: Colors.gray[700], marginBottom: 10 }}>
                {t("customer.bankAccounts.verifiedAs", { name: verifiedName })}
              </Text>
            ) : verificationAvailable ? (
              <TouchableOpacity
                disabled={busy}
                onPress={() => void verify()}
                style={{ borderWidth: 1, borderColor: Colors.primary, padding: 12, borderRadius: 12, marginBottom: 10 }}
              >
                <Text style={{ color: Colors.primary, textAlign: "center", fontWeight: "600" }}>
                  {t("customer.bankAccounts.verify")}
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={{ color: Colors.gray[600], marginBottom: 8 }}>
                  {t("customer.bankAccounts.verificationUnavailable")}
                </Text>
                <Text style={{ fontWeight: "600", marginBottom: 6 }}>{t("customer.bankAccounts.accountNameLabel")}</Text>
                <TextInput value={accountName} onChangeText={setAccountName} style={inputStyle} />
              </>
            )}

            <TouchableOpacity
              disabled={busy || (verificationAvailable && !verifiedName)}
              onPress={() => void save()}
              style={{
                backgroundColor: Colors.primary,
                padding: 14,
                borderRadius: 12,
                marginTop: 4,
                opacity: busy || (verificationAvailable && !verifiedName) ? 0.5 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", textAlign: "center", fontWeight: "700" }}>
                  {t("customer.bankAccounts.save")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
