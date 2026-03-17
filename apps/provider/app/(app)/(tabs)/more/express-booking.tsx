import { useState, useCallback, useEffect } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { APP_URL } from "@/config/public-env";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { Colors } from "@/constants/colors";

interface BookingLink {
  id: string;
  slug: string;
  url: string;
  is_active: boolean;
  embed_url?: string;
  business_name?: string;
}

interface ExpressLinkRow {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean;
  use_count?: number;
  location_id?: string | null;
  location_type?: string | null;
}

export default function ExpressBookingScreen() {
  const router = useRouter();
  const { data: link, loading, refresh } = useApi<BookingLink>(
    "/api/provider/booking-link"
  );
  const { execute: updateLink, loading: saving } = useApiMutation("patch");
  const [copied, setCopied] = useState(false);
  const [copiedShortId, setCopiedShortId] = useState<string | null>(null);
  const [customSlug, setCustomSlug] = useState("");
  const [editingSlug, setEditingSlug] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expressLinks, setExpressLinks] = useState<ExpressLinkRow[]>([]);
  const [expressLinksError, setExpressLinksError] = useState<string | null>(null);

  const loadExpressLinks = useCallback(async () => {
    setExpressLinksError(null);
    try {
      const res = await api.get<ExpressLinkRow[] | { data?: ExpressLinkRow[] }>(
        "/api/provider/express-booking"
      );
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as { data?: ExpressLinkRow[] })?.data ?? [];
      setExpressLinks(Array.isArray(list) ? list : []);
    } catch (e) {
      setExpressLinks([]);
      setExpressLinksError(e instanceof Error ? e.message : "Failed to load short links");
    }
  }, []);

  useEffect(() => {
    if (!loading && link) loadExpressLinks();
  }, [loading, link, loadExpressLinks]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    await loadExpressLinks();
    setRefreshing(false);
  }, [refresh, loadExpressLinks]);

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
          <View
            style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#eef2ff", padding: 24 }}
            accessibilityLabel="Booking link section"
          >
            <View style={{ alignItems: "center" }}>
              <View style={{ height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#c7d2fe" }}>
                <Ionicons name="flash" size={28} color="#6366f1" />
              </View>
              <Text style={{ marginTop: 12, fontSize: 18, fontWeight: "700", color: "#312e81" }}>
                Share Your Booking Link
              </Text>
              <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: "#4338ca" }}>
                Share this link with clients so they can book directly
              </Text>
            </View>

            {link?.url && (
              <View
                style={{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: "#c7d2fe", backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12 }}
                accessibilityLabel={`Booking link: ${link.url}`}
              >
                <Text
                  style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: "#4f46e5" }}
                  selectable
                  numberOfLines={2}
                >
                  {link.url}
                </Text>
              </View>
            )}

            <View style={{ marginTop: 16, flexDirection: "row" }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  marginRight: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  paddingVertical: 12,
                  backgroundColor: copied ? "#16a34a" : "#4f46e5",
                }}
                onPress={handleCopyLink}
                accessibilityLabel={copied ? "Link copied" : "Copy booking link"}
                accessibilityRole="button"
              >
                <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={18} color="#fff" />
                <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.white }}>
                  {copied ? "Copied!" : "Copy Link"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#a5b4fc", backgroundColor: Colors.white, paddingVertical: 12 }}
                onPress={handleShareLink}
                accessibilityLabel="Share booking link"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={18} color="#6366f1" />
                <Text style={{ marginLeft: 8, fontWeight: "600", color: "#4f46e5" }}>Share Link</Text>
              </TouchableOpacity>
            </View>
          </View>

          {link?.url && (
            <>
              <SectionHeader title="QR Code" />
              <View
                style={{ alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 24 }}
                accessibilityLabel="QR code for booking link"
              >
                <View style={{ alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: Colors.white, padding: 16 }}>
                  <QRCode value={link.url} size={180} color="#111827" backgroundColor="#ffffff" />
                </View>
                <Text style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: Colors.gray[500] }}>
                  Clients can scan this code to open your booking page
                </Text>
              </View>
            </>
          )}

          {link && (
            <>
              <SectionHeader title="Customize Link" />
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}>
                {editingSlug ? (
                  <>
                    <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Custom URL slug</Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TextInput
                        style={{ flex: 1, marginRight: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: Colors.gray[900] }}
                        placeholder="my-salon"
                        placeholderTextColor="#9ca3af"
                        value={customSlug}
                        onChangeText={setCustomSlug}
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="Custom URL slug input"
                      />
                      <ActionButton label="Save" variant="secondary" size="sm" onPress={handleSaveSlug} loading={saving} disabled={!customSlug.trim()} />
                    </View>
                    <TouchableOpacity onPress={() => setEditingSlug(false)} style={{ marginTop: 8, alignSelf: "flex-start" }} accessibilityLabel="Cancel editing slug" accessibilityRole="button">
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Current slug</Text>
                      <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "500", color: Colors.gray[900] }}>{link.slug}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
                      onPress={handleStartEditSlug}
                      accessibilityLabel="Edit booking link slug"
                      accessibilityRole="button"
                    >
                      <Ionicons name="pencil-outline" size={16} color="#6b7280" />
                      <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          )}

          {link && (
            <>
              <SectionHeader title="Link Status" />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ marginRight: 8, height: 12, width: 12, borderRadius: 9999, backgroundColor: link.is_active ? "#22c55e" : Colors.gray[300] }} />
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{link.is_active ? "Active" : "Inactive"}</Text>
                </View>
                <Text style={{ fontSize: 12, color: Colors.gray[400] }}>
                  {link.is_active ? "Clients can book via this link" : "Link is disabled"}
                </Text>
              </View>
            </>
          )}

          {(expressLinks.length > 0 || expressLinksError) && (
            <>
              <SectionHeader title="Short links" />
              {expressLinksError ? (
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", padding: 16 }}>
                  <Text style={{ fontSize: 14, color: "#991b1b" }}>{expressLinksError}</Text>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 12, backgroundColor: "#dc2626", paddingHorizontal: 16, paddingVertical: 8 }}
                    onPress={loadExpressLinks}
                    accessibilityLabel="Retry loading short links"
                    accessibilityRole="button"
                  >
                    <Text style={{ fontWeight: "500", color: Colors.white }}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={{ marginBottom: 8, fontSize: 12, color: Colors.gray[500] }}>
                    Pre-filled booking links. Create or edit on the web portal.
                  </Text>
                  <View>
                    {expressLinks.map((el, idx) => {
                      const fullUrl = `${(APP_URL || "").replace(/\/$/, "")}/book/l/${encodeURIComponent(el.slug)}`;
                      const embedUrl = `${fullUrl}?embed=1`;
                      const isCopied = copiedShortId === el.id;
                      return (
                        <View key={el.id} style={{ marginTop: idx === 0 ? 0 : 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{el.name}</Text>
                              <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }} numberOfLines={1}>{fullUrl}</Text>
                              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 }}>
                                {el.location_type === "at_home" && (
                                  <Text style={{ fontSize: 11, color: Colors.gray[500] }}>At home</Text>
                                )}
                                {(el.location_type === "at_salon" || el.location_id) && (
                                  <Text style={{ fontSize: 11, color: Colors.gray[500] }}>At salon</Text>
                                )}
                                {el.use_count != null && (
                                  <Text style={{ fontSize: 12, color: Colors.gray[400] }}>{el.use_count} click{el.use_count !== 1 ? "s" : ""}</Text>
                                )}
                              </View>
                            </View>
                            <View style={{ flexDirection: "row" }}>
                              <TouchableOpacity
                                style={{ marginRight: 8, borderRadius: 8, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
                                onPress={async () => {
                                  try {
                                    await Clipboard.setStringAsync(fullUrl);
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    setCopiedShortId(el.id);
                                    setTimeout(() => setCopiedShortId(null), 2000);
                                  } catch {
                                    Alert.alert("Error", "Failed to copy");
                                  }
                                }}
                                accessibilityLabel="Copy short link"
                                accessibilityRole="button"
                              >
                                <Ionicons name={isCopied ? "checkmark-circle" : "copy-outline"} size={18} color={isCopied ? "#059669" : "#6b7280"} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{ marginRight: 8, borderRadius: 8, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
                                onPress={async () => {
                                  try {
                                    await Clipboard.setStringAsync(embedUrl);
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    Alert.alert("Copied", "Embed URL copied. Use it in your website iframe.");
                                  } catch {
                                    Alert.alert("Error", "Failed to copy");
                                  }
                                }}
                                accessibilityLabel="Copy embed URL"
                                accessibilityRole="button"
                              >
                                <Ionicons name="code-slash-outline" size={18} color="#6b7280" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{ marginRight: 8, borderRadius: 8, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
                                onPress={() => Share.share({ message: `Book with me: ${fullUrl}`, url: fullUrl })}
                                accessibilityLabel="Share short link"
                                accessibilityRole="button"
                              >
                                <Ionicons name="share-outline" size={18} color="#6b7280" />
                              </TouchableOpacity>
                              {APP_URL && (
                                <TouchableOpacity
                                  style={{ marginRight: 8, borderRadius: 8, backgroundColor: "#e0e7ff", paddingHorizontal: 12, paddingVertical: 8 }}
                                  onPress={() => {
                    const url = `${(APP_URL || "").replace(/\/$/, "")}/provider/express-booking`;
                    router.push({
                      pathname: "/(app)/(tabs)/more/in-app-browser",
                      params: { url: encodeURIComponent(url), title: "Express booking" },
                    } as never);
                  }}
                                  accessibilityLabel="Manage links on web"
                                  accessibilityRole="button"
                                >
                                  <Ionicons name="open-outline" size={18} color="#6366f1" />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          )}

          <View style={{ height: 32 }} />
        </>
      )}
    </ScreenContainer>
  );
}
