import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";

interface BookingLink {
  id: string;
  slug: string;
  url: string;
  is_active: boolean;
  embed_url?: string;
  business_name?: string;
}

export default function ExpressBookingScreen() {
  const { data: link, loading, refresh } = useApi<BookingLink>(
    "/api/provider/booking-link"
  );
  const { execute: updateLink, loading: saving } = useApiMutation("patch");
  const [copied, setCopied] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [editingSlug, setEditingSlug] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  async function handleCopyLink() {
    if (!link?.url) return;
    try {
      await Clipboard.setStringAsync(link.url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Error", "Failed to copy link to clipboard");
    }
  }

  async function handleShareLink() {
    if (!link?.url) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: `Book an appointment with me: ${link.url}`,
        url: link.url,
      });
    } catch {
      // User cancelled share
    }
  }

  async function handleSaveSlug() {
    if (!link || !customSlug.trim()) return;
    const { error } = await updateLink("/api/provider/booking-link", {
      slug: customSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    });
    if (error) {
      Alert.alert("Error", error);
    } else {
      setEditingSlug(false);
      await refresh();
    }
  }

  function handleStartEditSlug() {
    setCustomSlug(link?.slug ?? "");
    setEditingSlug(true);
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Express Booking"
        showBack
        subtitle="Quick booking link"
      />

      {loading ? (
        <LoadingState fullScreen={false} />
      ) : (
        <>
          {/* Hero Section */}
          <View
            className="mb-4 rounded-2xl bg-indigo-50 p-6"
            accessibilityLabel="Booking link section"
          >
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
                <Ionicons name="flash" size={28} color="#6366f1" />
              </View>
              <Text className="mt-3 text-lg font-bold text-indigo-900">
                Share Your Booking Link
              </Text>
              <Text className="mt-1 text-center text-sm text-indigo-700">
                Share this link with clients so they can book directly
              </Text>
            </View>

            {/* Link Display */}
            {link?.url && (
              <View
                className="mt-4 rounded-xl border border-indigo-200 bg-white px-4 py-3"
                accessibilityLabel={`Booking link: ${link.url}`}
              >
                <Text
                  className="text-center text-sm font-medium text-indigo-600"
                  selectable
                  numberOfLines={2}
                >
                  {link.url}
                </Text>
              </View>
            )}

            {/* Copy & Share Buttons */}
            <View className="mt-4 flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center rounded-xl py-3 ${
                  copied ? "bg-green-600" : "bg-indigo-600"
                }`}
                onPress={handleCopyLink}
                accessibilityLabel={copied ? "Link copied" : "Copy booking link"}
                accessibilityRole="button"
              >
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={18}
                  color="#fff"
                />
                <Text className="ml-2 font-semibold text-white">
                  {copied ? "Copied!" : "Copy Link"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 flex-row items-center justify-center rounded-xl border border-indigo-300 bg-white py-3"
                onPress={handleShareLink}
                accessibilityLabel="Share booking link"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={18} color="#6366f1" />
                <Text className="ml-2 font-semibold text-indigo-600">
                  Share Link
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* QR Code */}
          {link?.url && (
            <>
              <SectionHeader title="QR Code" />
              <View
                className="items-center rounded-2xl border border-gray-100 bg-white p-6"
                accessibilityLabel="QR code for booking link"
              >
                <View className="items-center justify-center rounded-2xl bg-white p-4">
                  <QRCode
                    value={link.url}
                    size={180}
                    color="#111827"
                    backgroundColor="#ffffff"
                  />
                </View>
                <Text className="mt-3 text-center text-xs text-gray-500">
                  Clients can scan this code to open your booking page
                </Text>
              </View>
            </>
          )}

          {/* Customize Slug */}
          {link && (
            <>
              <SectionHeader title="Customize Link" />
              <View className="rounded-2xl border border-gray-100 bg-white p-4">
                {editingSlug ? (
                  <>
                    <Text className="mb-2 text-sm font-medium text-gray-700">
                      Custom URL slug
                    </Text>
                    <View className="flex-row items-center gap-3">
                      <TextInput
                        className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
                        placeholder="my-salon"
                        placeholderTextColor="#9ca3af"
                        value={customSlug}
                        onChangeText={setCustomSlug}
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="Custom URL slug input"
                      />
                      <ActionButton
                        label="Save"
                        variant="secondary"
                        size="sm"
                        onPress={handleSaveSlug}
                        loading={saving}
                        disabled={!customSlug.trim()}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => setEditingSlug(false)}
                      className="mt-2 self-start"
                      accessibilityLabel="Cancel editing slug"
                      accessibilityRole="button"
                    >
                      <Text className="text-sm text-gray-500">Cancel</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-sm text-gray-500">
                        Current slug
                      </Text>
                      <Text className="mt-0.5 text-base font-medium text-gray-900">
                        {link.slug}
                      </Text>
                    </View>
                    <TouchableOpacity
                      className="flex-row items-center rounded-lg bg-gray-100 px-3 py-2"
                      onPress={handleStartEditSlug}
                      accessibilityLabel="Edit booking link slug"
                      accessibilityRole="button"
                    >
                      <Ionicons name="pencil-outline" size={16} color="#6b7280" />
                      <Text className="ml-1 text-sm font-medium text-gray-700">
                        Edit
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          )}

          {/* Active Toggle */}
          {link && (
            <>
              <SectionHeader title="Link Status" />
              <View className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-4">
                <View className="flex-row items-center">
                  <View
                    className={`mr-2 h-3 w-3 rounded-full ${
                      link.is_active ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <Text className="text-sm font-medium text-gray-900">
                    {link.is_active ? "Active" : "Inactive"}
                  </Text>
                </View>
                <Text className="text-xs text-gray-400">
                  {link.is_active
                    ? "Clients can book via this link"
                    : "Link is disabled"}
                </Text>
              </View>
            </>
          )}

          <View className="h-8" />
        </>
      )}
    </ScreenContainer>
  );
}
