/**
 * Refer another business to Beautonomi (provider referral pipeline).
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

type ReferralRow = {
  id: string;
  business_name: string | null;
  status: string;
  created_at: string;
};

export default function ReferABusinessScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rb = useCallback(
    (key: string) => t(`web.provider.pages.referrals.${key}`) as string,
    [t],
  );

  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await api.get<{ referrals: ReferralRow[] }>("/api/provider/referrals");
    if (res.error) {
      setLoadError(res.error.message || rb("loadFailed"));
      setReferrals([]);
    } else {
      setReferrals(res.data?.referrals ?? []);
    }
    setLoading(false);
  }, [rb]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!businessName.trim()) {
      Alert.alert(rb("businessNameRequired"));
      return;
    }
    if (!email.trim() && !phone.trim()) {
      Alert.alert(rb("emailOrPhoneRequired"));
      return;
    }
    setSubmitting(true);
    const res = await api.post("/api/provider/referrals", {
      business_name: businessName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setSubmitting(false);
    if (res.error) {
      Alert.alert(rb("submitFailed"), res.error.message);
      return;
    }
    setBusinessName("");
    setEmail("");
    setPhone("");
    Alert.alert(rb("thankYou"), rb("pipelineHint"));
    void load();
  };

  if (loading && referrals.length === 0 && !loadError) {
    return (
      <ScreenContainer>
        <ScreenHeader title={rb("title")} onBack={() => router.back()} />
        <LoadingState />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={rb("title")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {loadError ? (
          <ErrorState message={loadError} onRetry={() => void load()} />
        ) : referrals.length > 0 ? (
          <View style={twStyle("mb-6 rounded-xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-base font-semibold text-gray-900")}>{rb("yourReferrals")}</Text>
            {referrals.map((row) => (
              <View key={row.id} style={twStyle("border-t border-gray-100 py-3")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {row.business_name || rb("referredBusiness")}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>{new Date(row.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{rb("businessNameRequiredLabel")}</Text>
        <TextInput
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base")}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder={rb("businessNamePlaceholder")}
        />
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{t("web.provider.common.email")}</Text>
        <TextInput
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base")}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{t("web.provider.common.phone")}</Text>
        <TextInput
          style={twStyle("mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base")}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <ActionButton label={rb("submitReferral")} onPress={() => void submit()} loading={submitting} />
      </ScrollView>
    </ScreenContainer>
  );
}
