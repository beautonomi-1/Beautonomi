import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  Switch,
  TouchableOpacity,
  Share,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import QRCode from "react-native-qrcode-svg";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface OnlineBookingSettings {
  enabled: boolean;
  advanceNoticeHours: number;
  cancellationHours: number;
  requireDeposit: boolean;
  depositPercentage: number;
  allowGuestBooking: boolean;
  maxAdvanceDays: number;
}

interface BookingLink {
  url: string;
  embed_url: string;
  slug: string;
  is_active: boolean;
}

export default function OnlineBookingScreen() {
  const {
    data: settings,
    loading: loadingSettings,
    refresh: refreshSettings,
  } = useApi<OnlineBookingSettings>("/api/provider/settings/online-booking");
  const {
    data: link,
    loading: loadingLink,
    refresh: refreshLink,
  } = useApi<BookingLink>("/api/provider/booking-link");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");
  const { execute: updateSlug, loading: updatingSlug } = useApiMutation("patch");

  const [enabled, setEnabled] = useState(true);
  const [advanceNotice, setAdvanceNotice] = useState("24");
  const [cancellationHours, setCancellationHours] = useState("24");
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState("50");
  const [allowGuestBooking, setAllowGuestBooking] = useState(true);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState("90");

  const [showQR, setShowQR] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showSlugEdit, setShowSlugEdit] = useState(false);
  const [newSlug, setNewSlug] = useState("");

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setAdvanceNotice(String(settings.advanceNoticeHours));
      setCancellationHours(String(settings.cancellationHours));
      setRequireDeposit(settings.requireDeposit ?? false);
      setDepositPercentage(String(settings.depositPercentage ?? 50));
      setAllowGuestBooking(settings.allowGuestBooking ?? true);
      setMaxAdvanceDays(String(settings.maxAdvanceDays ?? 90));
    }
  }, [settings]);

  async function handleSave() {
    const { error } = await saveSettings("/api/provider/settings/online-booking", {
      enabled,
      advanceNoticeHours: Number(advanceNotice) || 24,
      cancellationHours: Number(cancellationHours) || 24,
      requireDeposit,
      depositPercentage: Number(depositPercentage) || 50,
      allowGuestBooking,
      maxAdvanceDays: Number(maxAdvanceDays) || 90,
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshSettings();
  }

  async function handleCopyLink() {
    if (link?.url) {
      await Clipboard.setStringAsync(link.url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Copied", "Booking link copied to clipboard");
    }
  }

  async function handleShareLink() {
    if (link?.url) {
      await Share.share({
        message: `Book an appointment with us: ${link.url}`,
        url: link.url,
      });
    }
  }

  async function handleShareWhatsApp() {
    if (link?.url) {
      const message = encodeURIComponent(
        `Book an appointment with us! 💈✨\n${link.url}`
      );
      const url =
        Platform.OS === "web"
          ? `https://wa.me/?text=${message}`
          : `whatsapp://send?text=${message}`;
      try {
        await Linking.openURL(url);
      } catch {
        await Share.share({ message: `Book an appointment: ${link.url}` });
      }
    }
  }

  async function handleShareSMS() {
    if (link?.url) {
      const body = encodeURIComponent(`Book an appointment with us: ${link.url}`);
      const url =
        Platform.OS === "ios" ? `sms:&body=${body}` : `sms:?body=${body}`;
      try {
        await Linking.openURL(url);
      } catch {
        await Share.share({ message: `Book an appointment: ${link.url}` });
      }
    }
  }

  async function handleCopyEmbed() {
    if (link?.embed_url) {
      const embedCode = `<iframe src="${link.embed_url}" width="100%" height="700" frameborder="0" style="border-radius: 12px; border: 1px solid #e5e7eb;"></iframe>`;
      await Clipboard.setStringAsync(embedCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Copied", "Embed code copied to clipboard");
    }
  }

  async function handleSaveSlug() {
    if (!newSlug.trim()) {
      Alert.alert("Required", "Custom URL slug is required");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(newSlug.trim())) {
      Alert.alert(
        "Invalid",
        "Slug can only contain lowercase letters, numbers, and hyphens"
      );
      return;
    }
    const { error } = await updateSlug("/api/provider/booking-link", {
      slug: newSlug.trim(),
    });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSlugEdit(false);
    refreshLink();
  }

  const loading = loadingSettings || loadingLink;
  if (loading && !settings && !link)
    return (
      <ScreenContainer>
        <ScreenHeader title="Online Booking" showBack />
        <LoadingState message="Loading settings..." />
      </ScreenContainer>
    );

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Online Booking"
        showBack
        subtitle="Booking link & settings"
      />

      {/* Booking Link Section */}
      {link && (
        <>
          <SectionHeader title="Booking Link" />
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
            {/* URL display */}
            <View style={twStyle("mb-3 flex-row items-center rounded-xl bg-gray-50 p-3")}>
              <Ionicons name="link-outline" size={16} color="#6b7280" />
              <Text style={twStyle("ml-2 flex-1 text-sm text-gray-700")} selectable>
                {link.url}
              </Text>
            </View>

            {/* Custom slug */}
            <TouchableOpacity
              style={twStyle("mb-4 flex-row items-center")}
              onPress={() => {
                setNewSlug(link.slug);
                setShowSlugEdit(true);
              }}
            >
              <Ionicons name="create-outline" size={14} color="#6366f1" />
              <Text style={twStyle("ml-1 text-xs font-medium text-indigo-600")}>
                Customize URL
              </Text>
            </TouchableOpacity>

            {/* Primary share actions */}
            <View style={twStyle("flex-row")}>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-2.5"), { marginRight: 8 }]}
                onPress={handleCopyLink}
              >
                <Ionicons name="copy-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-indigo-700")}>
                  Copy
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-2.5")}
                onPress={handleShareLink}
              >
                <Ionicons name="share-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-indigo-700")}>
                  Share
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-2.5")}
                onPress={() => setShowQR(true)}
              >
                <Ionicons name="qr-code-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-indigo-700")}>
                  QR
                </Text>
              </TouchableOpacity>
            </View>

            {/* Social share buttons */}
            <View style={twStyle("mt-3 flex-row")}>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-green-50 py-2.5"), { marginRight: 8 }]}
                onPress={handleShareWhatsApp}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#22c55e" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-green-700")}>
                  WhatsApp
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-blue-50 py-2.5"), { marginRight: 8 }]}
                onPress={handleShareSMS}
              >
                <Ionicons name="chatbubble-outline" size={16} color="#3b82f6" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-blue-700")}>
                  SMS
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-gray-100 py-2.5")}
                onPress={() => setShowEmbed(true)}
              >
                <Ionicons name="code-slash-outline" size={16} color="#6b7280" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-gray-700")}>
                  Embed
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Booking Settings */}
      <SectionHeader title="Booking Settings" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              Online Booking Enabled
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              Allow clients to book online
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={enabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              Allow Guest Booking
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              Clients can book without an account
            </Text>
          </View>
          <Switch
            value={allowGuestBooking}
            onValueChange={setAllowGuestBooking}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={allowGuestBooking ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          Advance Notice (hours)
        </Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={advanceNotice}
          onChangeText={setAdvanceNotice}
          keyboardType="number-pad"
          placeholder="24"
          placeholderTextColor="#9ca3af"
        />
        <Text style={twStyle("mb-3 text-xs text-gray-400")}>
          Minimum hours before appointment that clients can book
        </Text>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          Cancellation Window (hours)
        </Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={cancellationHours}
          onChangeText={setCancellationHours}
          keyboardType="number-pad"
          placeholder="24"
          placeholderTextColor="#9ca3af"
        />
        <Text style={twStyle("mb-3 text-xs text-gray-400")}>
          Minimum hours before appointment that clients can cancel
        </Text>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          Max Advance Booking (days)
        </Text>
        <TextInput
          style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          value={maxAdvanceDays}
          onChangeText={setMaxAdvanceDays}
          keyboardType="number-pad"
          placeholder="90"
          placeholderTextColor="#9ca3af"
        />
        <Text style={twStyle("mb-3 text-xs text-gray-400")}>
          How far in advance clients can book
        </Text>
      </View>

      {/* Deposit Settings */}
      <SectionHeader title="Deposit Settings" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              Require Deposit
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              Clients must pay a deposit to confirm booking
            </Text>
          </View>
          <Switch
            value={requireDeposit}
            onValueChange={setRequireDeposit}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={requireDeposit ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        {requireDeposit && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              Deposit Percentage (%)
            </Text>
            <TextInput
              style={twStyle("mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              value={depositPercentage}
              onChangeText={setDepositPercentage}
              keyboardType="number-pad"
              placeholder="50"
              placeholderTextColor="#9ca3af"
            />
            <Text style={twStyle("mb-1 text-xs text-gray-400")}>
              Percentage of service price required as deposit
            </Text>
          </>
        )}
      </View>

      <View style={twStyle("mt-4")}>
        <ActionButton
          label="Save Settings"
          onPress={handleSave}
          loading={saving}
          fullWidth
        />
      </View>

      <View style={twStyle("h-8")} />

      {/* QR Code Bottom Sheet */}
      <BottomSheet
        visible={showQR}
        onClose={() => setShowQR(false)}
        title="Booking QR Code"
      >
        {link && (
          <View style={twStyle("items-center")}>
            <View style={twStyle("mb-4 rounded-2xl bg-white p-6 shadow-sm")}>
              <QRCode
                value={link.url}
                size={220}
                color="#111827"
                backgroundColor="#ffffff"
              />
            </View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-900")}>
              Scan to book
            </Text>
            <Text style={twStyle("mb-4 text-center text-xs text-gray-500")}>
              Print this QR code and display it at your reception desk, business
              card, or storefront
            </Text>
            <View style={twStyle("w-full flex-row")}>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3"), { marginRight: 12 }]}
                onPress={handleCopyLink}
              >
                <Ionicons name="copy-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-indigo-700")}>
                  Copy Link
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3")}
                onPress={handleShareLink}
              >
                <Ionicons name="share-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ml-1.5 text-sm font-medium text-indigo-700")}>
                  Share
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheet>

      {/* Embed Code Bottom Sheet */}
      <BottomSheet
        visible={showEmbed}
        onClose={() => setShowEmbed(false)}
        title="Embed on Website"
      >
        {link && (
          <View>
            <Text style={twStyle("mb-2 text-sm text-gray-700")}>
              Add this code to your website to embed the booking widget:
            </Text>
            <View style={twStyle("mb-4 rounded-xl bg-gray-900 p-4")}>
              <Text style={twStyle("font-mono text-xs leading-5 text-green-400")} selectable>
                {`<iframe\n  src="${link.embed_url}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  style="border-radius: 12px;"\n></iframe>`}
              </Text>
            </View>
            <ActionButton label="Copy Embed Code" onPress={handleCopyEmbed} fullWidth />
            <Text style={twStyle("mt-2 text-center text-xs text-gray-400")}>
              Works with any website builder — WordPress, Wix, Squarespace, etc.
            </Text>
          </View>
        )}
      </BottomSheet>

      {/* Custom Slug Editor */}
      <BottomSheet
        visible={showSlugEdit}
        onClose={() => setShowSlugEdit(false)}
        title="Customize Booking URL"
      >
        <View>
          <Text style={twStyle("mb-2 text-sm text-gray-700")}>
            Choose a custom URL for your booking page:
          </Text>
          <View style={twStyle("mb-3 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <Text style={twStyle("text-sm text-gray-400")}>book.beautonomi.com/</Text>
            <TextInput
              style={twStyle("flex-1 text-base font-medium text-gray-900")}
              value={newSlug}
              onChangeText={(t) => setNewSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="your-salon"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={twStyle("mb-4 text-xs text-gray-400")}>
            Only lowercase letters, numbers, and hyphens allowed
          </Text>
          <ActionButton
            label="Save Custom URL"
            onPress={handleSaveSlug}
            loading={updatingSlug}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
