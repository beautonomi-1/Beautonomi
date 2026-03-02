import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Share, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Ionicons } from "@expo/vector-icons";

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
    } catch {
      // User cancelled or error
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View className="gap-4 px-4">
        {!isEnabled && (
          <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Text className="text-sm text-amber-800">
              Referrals are currently disabled. You can still see your code; rewards will apply when the program is enabled again.
            </Text>
          </View>
        )}

        <View className="bg-pink-50 rounded-2xl p-4">
          <Text className="text-sm text-gray-600">Your referral code</Text>
          <Text className="text-xl font-bold text-gray-900 mt-1 font-mono">{code || "—"}</Text>
        </View>

        <View className="bg-white rounded-2xl border border-gray-200 p-4">
          <Text className="text-sm text-gray-600 mb-1">Your referral link</Text>
          <Text className="text-base text-gray-900 font-mono" numberOfLines={2} selectable>
            {link || "—"}
          </Text>
          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              onPress={handleCopy}
              className="flex-1 flex-row items-center justify-center gap-2 bg-gray-100 py-3 rounded-xl"
            >
              <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={20} color="#374151" />
              <Text className="text-gray-700 font-medium">{copied ? "Copied" : "Copy link"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#FF0077] py-3 rounded-xl"
            >
              <Ionicons name="share-outline" size={20} color="white" />
              <Text className="text-white font-medium">Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text className="text-gray-600 text-sm">
          Share your code or link. When a friend signs up and completes their first booking, you earn {amount} {currency}.
        </Text>

        {stats && (stats.total_referrals > 0 || stats.successful_referrals > 0 || stats.total_earnings > 0) && (
          <View className="rounded-2xl border border-gray-200 bg-white p-4 gap-3">
            <Text className="font-semibold text-gray-900">Your stats</Text>
            <View className="flex-row flex-wrap gap-4">
              <View>
                <Text className="text-2xl font-bold text-gray-900">{stats.total_referrals}</Text>
                <Text className="text-sm text-gray-500">Total referrals</Text>
              </View>
              <View>
                <Text className="text-2xl font-bold text-gray-900">{stats.successful_referrals}</Text>
                <Text className="text-sm text-gray-500">Successful</Text>
              </View>
              <View>
                <Text className="text-2xl font-bold text-gray-900">{stats.total_earnings}</Text>
                <Text className="text-sm text-gray-500">{currency} earned</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </ScreenFrame>
  );
}
