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
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";
import { buildBookingIframeSnippet } from "@beautonomi/utils";

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

function iframeSnippetForLink(link: BookingLink): string {
  try {
    return buildBookingIframeSnippet({
      origin: new URL(link.embed_url).origin,
      slug: link.slug,
      height: 700,
    });
  } catch {
    return "";
  }
}

export default function OnlineBookingScreen() {
  const { t } = useTranslation();
  const ob = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.onlineBooking.${key}`, opts) as string;

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
      Alert.alert(ob("alertErrorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshSettings();
  }

  async function handleCopyLink() {
    if (link?.url) {
      await Clipboard.setStringAsync(link.url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(ob("alertCopiedLinkTitle"), ob("alertCopiedLinkBody"));
    }
  }

  async function handleShareLink() {
    if (link?.url) {
      await Share.share({
        message: ob("shareMessage", { url: link.url }),
        url: link.url,
      });
    }
  }

  async function handleShareWhatsApp() {
    if (link?.url) {
      const message = encodeURIComponent(
        ob("shareWhatsAppMessage", { url: link.url }),
      );
      const url =
        Platform.OS === "web"
          ? `https://wa.me/?text=${message}`
          : `whatsapp://send?text=${message}`;
      try {
        await Linking.openURL(url);
      } catch {
        await Share.share({ message: ob("shareFallbackMessage", { url: link.url }) });
      }
    }
  }

  async function handleShareSMS() {
    if (link?.url) {
      const body = encodeURIComponent(ob("shareSmsMessage", { url: link.url }));
      const url =
        Platform.OS === "ios" ? `sms:&body=${body}` : `sms:?body=${body}`;
      try {
        await Linking.openURL(url);
      } catch {
        await Share.share({ message: ob("shareFallbackMessage", { url: link.url }) });
      }
    }
  }

  async function handleCopyEmbed() {
    if (link?.embed_url) {
      const embedCode = iframeSnippetForLink(link);
      await Clipboard.setStringAsync(embedCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(ob("alertCopiedEmbedTitle"), ob("alertCopiedEmbedBody"));
    }
  }

  async function handleSaveSlug() {
    if (!newSlug.trim()) {
      Alert.alert(ob("alertRequiredTitle"), ob("alertSlugRequired"));
      return;
    }
    if (!/^[a-z0-9-]+$/.test(newSlug.trim())) {
      Alert.alert(
        ob("alertInvalidTitle"),
        ob("alertSlugInvalid"),
      );
      return;
    }
    const { error } = await updateSlug("/api/provider/booking-link", {
      slug: newSlug.trim(),
    });
    if (error) {
      Alert.alert(ob("alertErrorTitle"), error);
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
        <ScreenHeader title={ob("title")} showBack />
        <LoadingState message={ob("loadingSettings")} />
      </ScreenContainer>
    );

  return (
    <ScreenContainer>
      <ScreenHeader
        title={ob("title")}
        showBack
        subtitle={ob("subtitle")}
      />

      {/* Booking Link Section */}
      {link && (
        <>
          <SectionHeader title={ob("sectionBookingLink")} />
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
            {/* URL display */}
            <View style={twStyle("mb-3 flex-row items-center rounded-xl bg-gray-50 p-3")}>
              <Ionicons name="link-outline" size={16} color="#6b7280" />
              <Text style={twStyle("ms-2 flex-1 text-sm text-gray-700")} selectable>
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
              <Text style={twStyle("ms-1 text-xs font-medium text-indigo-600")}>
                {ob("customizeUrl")}
              </Text>
            </TouchableOpacity>

            {/* Primary share actions */}
            <View style={twStyle("flex-row")}>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-2.5"), { marginEnd: 8 }]}
                onPress={handleCopyLink}
              >
                <Ionicons name="copy-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-indigo-700")}>
                  {ob("copy")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-2.5")}
                onPress={handleShareLink}
              >
                <Ionicons name="share-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-indigo-700")}>
                  {ob("share")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-2.5")}
                onPress={() => setShowQR(true)}
              >
                <Ionicons name="qr-code-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-indigo-700")}>
                  {ob("qr")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Social share buttons */}
            <View style={twStyle("mt-3 flex-row")}>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-green-50 py-2.5"), { marginEnd: 8 }]}
                onPress={handleShareWhatsApp}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#22c55e" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-green-700")}>
                  {ob("whatsapp")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-blue-50 py-2.5"), { marginEnd: 8 }]}
                onPress={handleShareSMS}
              >
                <Ionicons name="chatbubble-outline" size={16} color="#3b82f6" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-blue-700")}>
                  {ob("sms")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-gray-100 py-2.5")}
                onPress={() => setShowEmbed(true)}
              >
                <Ionicons name="code-slash-outline" size={16} color="#6b7280" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-gray-700")}>
                  {ob("embed")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Booking Settings */}
      <SectionHeader title={ob("sectionBookingSettings")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              {ob("onlineBookingEnabled")}
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              {ob("onlineBookingEnabledHint")}
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
              {ob("allowGuestBooking")}
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              {ob("allowGuestBookingHint")}
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
          {ob("advanceNoticeLabel")}
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
          {ob("advanceNoticeHint")}
        </Text>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          {ob("cancellationWindowLabel")}
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
          {ob("cancellationWindowHint")}
        </Text>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          {ob("maxAdvanceBookingLabel")}
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
          {ob("maxAdvanceBookingHint")}
        </Text>
      </View>

      {/* Deposit Settings */}
      <SectionHeader title={ob("sectionDepositSettings")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              {ob("requireDeposit")}
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              {ob("requireDepositHint")}
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
              {ob("depositPercentageLabel")}
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
              {ob("depositPercentageHint")}
            </Text>
          </>
        )}
      </View>

      <View style={twStyle("mt-4")}>
        <ActionButton
          label={ob("saveSettings")}
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
        title={ob("qrSheetTitle")}
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
              {ob("scanToBook")}
            </Text>
            <Text style={twStyle("mb-4 text-center text-xs text-gray-500")}>
              {ob("qrSheetHint")}
            </Text>
            <View style={twStyle("w-full flex-row")}>
              <TouchableOpacity
                style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3"), { marginEnd: 12 }]}
                onPress={handleCopyLink}
              >
                <Ionicons name="copy-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-indigo-700")}>
                  {ob("copyLink")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3")}
                onPress={handleShareLink}
              >
                <Ionicons name="share-outline" size={16} color="#6366f1" />
                <Text style={twStyle("ms-1.5 text-sm font-medium text-indigo-700")}>
                  {ob("share")}
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
        title={ob("embedSheetTitle")}
      >
        {link && (
          <View>
            <Text style={twStyle("mb-2 text-sm text-gray-700")}>
              {ob("embedSheetBody")}
            </Text>
            <View style={twStyle("mb-4 rounded-xl bg-gray-900 p-4")}>
              <Text style={twStyle("font-mono text-xs leading-5 text-green-400")} selectable>
                {iframeSnippetForLink(link)}
              </Text>
            </View>
            <ActionButton label={ob("copyEmbedCode")} onPress={handleCopyEmbed} fullWidth />
            <Text style={twStyle("mt-2 text-center text-xs text-gray-400")}>
              {ob("embedSheetFooter")}
            </Text>
          </View>
        )}
      </BottomSheet>

      {/* Custom Slug Editor */}
      <BottomSheet
        visible={showSlugEdit}
        onClose={() => setShowSlugEdit(false)}
        title={ob("slugSheetTitle")}
      >
        <View>
          <Text style={twStyle("mb-2 text-sm text-gray-700")}>
            {ob("slugSheetBody")}
          </Text>
          <View style={twStyle("mb-3 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <Text style={twStyle("text-sm text-gray-400")}>{ob("slugPrefix")}</Text>
            <TextInput
              style={twStyle("flex-1 text-base font-medium text-gray-900")}
              value={newSlug}
              onChangeText={(t) => setNewSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder={ob("slugPlaceholder")}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={twStyle("mb-4 text-xs text-gray-400")}>
            {ob("slugHelp")}
          </Text>
          <ActionButton
            label={ob("saveCustomUrl")}
            onPress={handleSaveSlug}
            loading={updatingSlug}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
