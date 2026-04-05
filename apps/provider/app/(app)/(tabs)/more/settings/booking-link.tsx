import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  Alert,
  TouchableOpacity,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { twStyle } from "@/lib/twStyle";

interface BookingLink {
  id: string;
  slug: string;
  url: string;
  embed_url: string;
  business_name: string;
  is_active: boolean;
  stats?: {
    total_visits: number;
    bookings_via_link: number;
    conversion_rate: number;
  };
}

export default function BookingLinkScreen() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: link, loading, refresh } = useApi<BookingLink>(
    "/api/provider/booking-link"
  );
  const { execute: updateLink, loading: saving } = useApiMutation<any>("patch");

  useEffect(() => {
    if (link) {
      setSlug(link.slug);
      setIsActive(link.is_active);
    }
  }, [link]);

  function update(k: string, v: any) {
    if (k === "slug") setSlug(v);
    if (k === "isActive") setIsActive(v);
    setDirty(true);
  }

  async function handleSave() {
    if (!slug.trim()) {
      Alert.alert("Required", "Booking URL slug is required");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      Alert.alert(
        "Invalid",
        "Slug must be lowercase letters, numbers, and dashes only"
      );
      return;
    }
    const { error } = await updateLink("/api/provider/booking-link", {
      slug,
      is_active: isActive,
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  async function handleCopy(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleShare() {
    if (!link?.url) return;
    try {
      await Share.share({
        message: `Book an appointment with ${link.business_name}: ${link.url}`,
        url: link.url,
      });
    } catch {
      /* user cancelled */
    }
  }

  if (loading)
    return (
      <ScreenContainer>
        <ScreenHeader title="Booking Link" showBack />
        <LoadingState message="Loading..." />
      </ScreenContainer>
    );

  const stats = link?.stats;

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Booking Link"
        showBack
        subtitle="Share your booking page"
      />

      {/* Analytics stats */}
      {stats && (
        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="Visits"
              value={String(stats.total_visits)}
              icon="eye-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="Bookings"
              value={String(stats.bookings_via_link)}
              icon="calendar-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title="Conv. Rate"
              value={`${stats.conversion_rate.toFixed(1)}%`}
              icon="trending-up-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact
            />
          </View>
        </View>
      )}

      {/* Main URL card */}
      {link?.url && (
        <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4")}>
          <Text style={twStyle("mb-1 text-xs font-medium text-indigo-600")}>
            Your Booking URL
          </Text>
          <Text
            style={twStyle("mb-3 text-sm font-mono font-semibold text-indigo-800")}
            numberOfLines={2}
          >
            {link.url}
          </Text>

          <View style={twStyle("flex-row")}>
            <TouchableOpacity
              style={[twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-white py-3 shadow-sm"), { marginRight: 8 }]}
              onPress={() => handleCopy(link.url, "url")}
            >
              <Ionicons
                name={copied === "url" ? "checkmark" : "copy-outline"}
                size={16}
                color="#6366f1"
              />
              <Text style={twStyle("ml-2 text-sm font-medium text-indigo-600")}>
                {copied === "url" ? "Copied!" : "Copy"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-indigo-600 py-3")}
              onPress={handleShare}
            >
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={twStyle("ml-2 text-sm font-medium text-white")}>
                Share
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Embed URL card */}
      {link?.embed_url && (
        <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View>
              <Text style={twStyle("text-xs font-medium text-gray-500")}>
                Embed URL
              </Text>
              <Text style={twStyle("text-[10px] text-gray-400")}>
                For embedding on your website
              </Text>
            </View>
            <TouchableOpacity
              style={twStyle("flex-row items-center rounded-lg bg-gray-100 px-3 py-1.5")}
              onPress={() => handleCopy(link.embed_url, "embed")}
            >
              <Ionicons
                name={copied === "embed" ? "checkmark" : "copy-outline"}
                size={14}
                color="#6366f1"
              />
              <Text style={twStyle("ml-1 text-xs font-medium text-indigo-600")}>
                {copied === "embed" ? "Copied!" : "Copy"}
              </Text>
            </TouchableOpacity>
          </View>
          <Text
            style={twStyle("mt-2 text-xs font-mono text-gray-600")}
            numberOfLines={1}
          >
            {link.embed_url}
          </Text>
        </View>
      )}

      {/* QR Code for booking page */}
      {link?.url && (
        <View style={twStyle("mb-4 items-center rounded-xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("rounded-xl bg-white p-2")}>
            <QRCode value={link.url} size={128} />
          </View>
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>
            QR code for your booking page
          </Text>
          <TouchableOpacity
            style={twStyle("mt-2 flex-row items-center rounded-lg bg-gray-100 px-3 py-1.5")}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={14} color="#6366f1" />
            <Text style={twStyle("ml-1 text-xs font-medium text-indigo-600")}>
              Share link
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Settings */}
      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        Settings
      </Text>
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View
              style={twStyle(`h-9 w-9 items-center justify-center rounded-lg ${
                isActive ? "bg-green-50" : "bg-red-50"
              }`)}
            >
              <Ionicons
                name={isActive ? "globe-outline" : "lock-closed-outline"}
                size={18}
                color={isActive ? "#22c55e" : "#ef4444"}
              />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                Online Booking
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                {isActive
                  ? "Clients can book via this link"
                  : "Booking link is disabled"}
              </Text>
            </View>
          </View>
          <Switch
            value={isActive}
            onValueChange={(v) => update("isActive", v)}
            trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
            thumbColor={isActive ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        <View style={twStyle("border-t border-gray-100 pt-3")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Custom URL Slug
          </Text>
          <TextInput
            style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={slug}
            onChangeText={(t) =>
              update(
                "slug",
                t.toLowerCase().replace(/[^a-z0-9-]/g, "")
              )
            }
            placeholder="your-business-name"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={twStyle("text-xs text-gray-400")}>
            Only lowercase letters, numbers, and dashes
          </Text>
        </View>
      </View>

      <ActionButton
        label="Save Changes"
        onPress={handleSave}
        loading={saving}
        disabled={!dirty}
        fullWidth
      />

      <TouchableOpacity
        style={twStyle("mt-4 flex-row items-center justify-center rounded-2xl border border-indigo-100 bg-white py-4")}
        onPress={() => router.push("/(app)/(tabs)/more/express-booking" as never)}
        accessibilityLabel="Open express short links and checkout prefill"
        accessibilityRole="button"
      >
        <Text style={twStyle("text-sm font-semibold text-indigo-600")}>Express short links & checkout prefill</Text>
      </TouchableOpacity>

      <View style={twStyle("h-24")} />
    </ScreenContainer>
  );
}
