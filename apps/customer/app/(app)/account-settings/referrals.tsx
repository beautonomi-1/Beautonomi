import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Share, Alert, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { trackReferralShared } from "@/lib/analytics";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

interface ReferralStats {
  total_referrals: number;
  successful_referrals: number;
  total_earnings: number;
  pending_earnings: number;
}

interface ReferralSettings {
  referral_amount?: number;
  referral_currency?: string;
  is_enabled?: boolean;
}

export default function ReferralsScreen() {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    referral_code: string;
    referral_link: string;
    stats?: ReferralStats;
    settings?: ReferralSettings;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/referrals");
      if (res.error) setError(res.error.message || t("common.error"));
      else setData(res.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const code = data?.referral_code ?? "";
  const link = data?.referral_link ?? "";
  const stats = data?.stats;
  const settings = data?.settings;
  const isEnabled = settings?.is_enabled !== false;
  const amount = settings?.referral_amount ?? 50;
  const currency = settings?.referral_currency ?? getTenantDefaultCurrency();
  const rewardFormatted = useMemo(() => formatMoney(amount, currency), [amount, currency]);

  const handleCopy = async () => {
    if (!link) return;
    try {
      await Clipboard.setStringAsync(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackReferralShared("referrals_copy");
    } catch {
      Alert.alert(t("common.error"), t("customer.referral.copyLinkFailed"));
    }
  };

  const handleShare = async () => {
    if (!link) return;
    try {
      await Share.share({
        message: t("customer.referral.shareMessage", { link }),
        title: t("customer.referral.shareTitle"),
        ...(Platform.OS === "ios" ? { url: link } : {}),
      });
      trackReferralShared("referrals_screen");
    } catch {
      // User cancelled or error
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View style={{ paddingHorizontal: 16 }}>
        {!isEnabled && (
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#FCD34D", backgroundColor: "#FFFBEB", padding: 12 }}>
            <Text style={{ fontSize: 14, color: "#92400E" }}>{t("customer.referral.disabledBanner")}</Text>
          </View>
        )}

        <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 16, marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{t("customer.referral.yourCode")}</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginTop: 4, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{code || "—"}</Text>
        </View>

        <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], padding: 16, marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 4 }}>{t("customer.referral.yourLink")}</Text>
          <Text style={{ fontSize: 16, color: Colors.gray[900], fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} numberOfLines={2} selectable>
            {link || "—"}
          </Text>
          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <TouchableOpacity
              onPress={handleCopy}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: Colors.gray[100], paddingVertical: 12, borderRadius: 12, marginRight: 8 }}
            >
              <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={20} color={Colors.gray[700]} style={{ marginRight: 8 }} />
              <Text style={{ color: Colors.gray[700], fontWeight: "500" }}>
                {copied ? t("customer.referral.copied") : t("customer.referral.copyLink")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 12 }}
            >
              <Ionicons name="share-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
              <Text style={{ color: Colors.white, fontWeight: "500" }}>{t("customer.referral.share")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={{ color: Colors.gray[600], fontSize: 14, marginTop: 16 }}>
          {t("customer.referral.earnExplainer", { amount: rewardFormatted })}
        </Text>

        {stats && (stats.total_referrals > 0 || stats.successful_referrals > 0 || stats.total_earnings > 0) && (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16, marginTop: 16 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{t("customer.referral.statsTitle")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
              <View style={{ marginRight: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{stats.total_referrals}</Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{t("customer.referral.totalReferrals")}</Text>
              </View>
              <View style={{ marginRight: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{stats.successful_referrals}</Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{t("customer.referral.successful")}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>
                  {formatMoney(stats.total_earnings, currency)}
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{t("customer.referral.earned")}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </ScreenFrame>
  );
}
