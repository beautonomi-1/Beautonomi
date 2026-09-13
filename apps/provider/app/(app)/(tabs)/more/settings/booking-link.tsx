import { useState, useEffect, useCallback } from "react";
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
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
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
  const { t } = useTranslation();
  const bl = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.bookingLink.${key}`, opts) as string,
    [t],
  );
  const [slug, setSlug] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: link, loading, error: loadError, refresh } = useApi<BookingLink>(
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
      Alert.alert(bl("requiredTitle"), bl("slugRequired"));
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      Alert.alert(
        bl("invalidTitle"),
        bl("slugInvalid")
      );
      return;
    }
    const { error } = await updateLink("/api/provider/booking-link", {
      slug,
      is_active: isActive,
    });
    if (error) {
      Alert.alert(bl("errorTitle"), error);
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
        message: bl("shareMessage", { name: link.business_name, url: link.url }),
        url: link.url,
      });
    } catch {
      /* user cancelled */
    }
  }

  if (loading)
    return (
      <ScreenContainer>
        <ScreenHeader title={bl("title")} showBack />
        <LoadingState message={bl("loading")} />
      </ScreenContainer>
    );

  if (loadError && !link)
    return (
      <ScreenContainer>
        <ScreenHeader title={bl("title")} showBack />
        <ErrorState message={bl("loadFailed")} onRetry={refresh} />
      </ScreenContainer>
    );

  const stats = link?.stats;

  return (
    <ScreenContainer>
      <ScreenHeader
        title={bl("title")}
        showBack
        subtitle={bl("subtitle")}
      />

      {/* Analytics stats */}
      {stats && (
        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
            <StatCard
              title={bl("visits")}
              value={String(stats.total_visits)}
              icon="eye-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
            <StatCard
              title={bl("bookings")}
              value={String(stats.bookings_via_link)}
              icon="calendar-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title={bl("convRate")}
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
            {bl("yourBookingUrl")}
          </Text>
          <Text
            style={twStyle("mb-3 text-sm font-mono font-semibold text-indigo-800")}
            numberOfLines={2}
          >
            {link.url}
          </Text>

          <View style={twStyle("flex-row")}>
            <TouchableOpacity
              style={[twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-white py-3 shadow-sm"), { marginEnd: 8 }]}
              onPress={() => handleCopy(link.url, "url")}
            >
              <Ionicons
                name={copied === "url" ? "checkmark" : "copy-outline"}
                size={16}
                color="#6366f1"
              />
              <Text style={twStyle("ms-2 text-sm font-medium text-indigo-600")}>
                {copied === "url" ? bl("copied") : bl("copy")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-indigo-600 py-3")}
              onPress={handleShare}
            >
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={twStyle("ms-2 text-sm font-medium text-white")}>
                {bl("share")}
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
                {bl("embedUrl")}
              </Text>
              <Text style={twStyle("text-[10px] text-gray-400")}>
                {bl("embedHint")}
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
              <Text style={twStyle("ms-1 text-xs font-medium text-indigo-600")}>
                {copied === "embed" ? bl("copied") : bl("copy")}
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
            {bl("qrHint")}
          </Text>
          <TouchableOpacity
            style={twStyle("mt-2 flex-row items-center rounded-lg bg-gray-100 px-3 py-1.5")}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={14} color="#6366f1" />
            <Text style={twStyle("ms-1 text-xs font-medium text-indigo-600")}>
              {bl("shareLink")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Settings */}
      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        {bl("settings")}
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
            <View style={twStyle("ms-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {bl("onlineBooking")}
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                {isActive
                  ? bl("linkEnabled")
                  : bl("linkDisabled")}
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
            {bl("customSlug")}
          </Text>
          <TextInput
            style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={slug}
            onChangeText={(text) =>
              update(
                "slug",
                text.toLowerCase().replace(/[^a-z0-9-]/g, "")
              )
            }
            placeholder={bl("slugPlaceholder")}
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={twStyle("text-xs text-gray-400")}>
            {bl("slugHint")}
          </Text>
        </View>
      </View>

      <ActionButton
        label={bl("saveChanges")}
        onPress={handleSave}
        loading={saving}
        disabled={!dirty}
        fullWidth
      />

      <TouchableOpacity
        style={twStyle("mt-4 flex-row items-center justify-center rounded-2xl border border-indigo-100 bg-white py-4")}
        onPress={() => router.push("/(app)/(tabs)/more/express-booking" as never)}
        accessibilityLabel={bl("expressLinksA11y")}
        accessibilityRole="button"
      >
        <Text style={twStyle("text-sm font-semibold text-indigo-600")}>{bl("expressLinks")}</Text>
      </TouchableOpacity>

      <View style={twStyle("h-24")} />
    </ScreenContainer>
  );
}
