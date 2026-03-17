import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Share, Alert, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { trackReferralShared } from "@/lib/analytics";

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
  const [data, setData] = useState<{
    referral_code: string;
    referral_link: string;
    stats?: ReferralStats;
    settings?: ReferralSettings;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/referrals");
      if (res.error) setError(res.error.message || "Failed to load");
      else setData(res.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const code = data?.referral_code ?? "";
  const link = data?.referral_link ?? "";
  const stats = data?.stats;
  const settings = data?.settings;
  const isEnabled = settings?.is_enabled !== false;
  const amount = settings?.referral_amount ?? 50;
  const currency = settings?.referral_currency ?? "ZAR";

  const handleCopy = async () => {
    if (!link) return;
    try {
      await Clipboard.setStringAsync(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackReferralShared("referrals_copy");
    } catch {
      Alert.alert("Error", "Could not copy link");
    }
  };

  const handleShare = async () => {
    if (!link) return;
    try {
      await Share.share({
        message: `Join me on Beautonomi and we both earn rewards! Use my link: ${link}`,
        url: link,
        title: "Join Beautonomi",
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
            <Text style={{ fontSize: 14, color: "#92400E" }}>
              Referrals are currently disabled. You can still see your code; rewards will apply when the program is enabled again.
            </Text>
          </View>
        )}

        <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 16, marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Your referral code</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginTop: 4, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{code || "—"}</Text>
        </View>

        <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], padding: 16, marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 4 }}>Your referral link</Text>
          <Text style={{ fontSize: 16, color: Colors.gray[900], fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} numberOfLines={2} selectable>
            {link || "—"}
          </Text>
          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <TouchableOpacity
              onPress={handleCopy}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: Colors.gray[100], paddingVertical: 12, borderRadius: 12, marginRight: 8 }}
            >
              <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={20} color={Colors.gray[700]} style={{ marginRight: 8 }} />
              <Text style={{ color: Colors.gray[700], fontWeight: "500" }}>{copied ? "Copied" : "Copy link"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 12 }}
            >
              <Ionicons name="share-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
              <Text style={{ color: Colors.white, fontWeight: "500" }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={{ color: Colors.gray[600], fontSize: 14 }}>
          Share your code or link. When a friend signs up and completes their first booking, you earn {amount} {currency}.
        </Text>

        {stats && (stats.total_referrals > 0 || stats.successful_referrals > 0 || stats.total_earnings > 0) && (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16, marginTop: 16 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Your stats</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
              <View style={{ marginRight: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{stats.total_referrals}</Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Total referrals</Text>
              </View>
              <View style={{ marginRight: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{stats.successful_referrals}</Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Successful</Text>
              </View>
              <View>
                <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{stats.total_earnings}</Text>
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{currency} earned</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </ScreenFrame>
  );
}
