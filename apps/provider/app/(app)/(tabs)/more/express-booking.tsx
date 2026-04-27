import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
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

type ExpressPrefill = {
  addon_ids?: string[];
  promotion_code?: string;
  gift_card_code?: string;
  product_cart?: { product_id: string; quantity: number; product_variant_id?: string | null }[];
};

interface ExpressLinkRow {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean;
  use_count?: number;
  location_id?: string | null;
  location_type?: string | null;
  prefill?: ExpressPrefill | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAddonIdsFromText(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));
}

function parseProductCartJson(raw: string): { ok: true; lines: NonNullable<ExpressPrefill["product_cart"]> } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim() || "[]");
  } catch {
    return { ok: false, message: "Invalid JSON." };
  }
  if (!Array.isArray(parsed)) return { ok: false, message: "Product cart must be a JSON array." };
  const lines: NonNullable<ExpressPrefill["product_cart"]> = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const product_id = typeof o.product_id === "string" ? o.product_id : null;
    const qty = typeof o.quantity === "number" ? o.quantity : Number(o.quantity);
    if (!product_id || !UUID_RE.test(product_id) || !Number.isFinite(qty) || qty < 1) continue;
    const variant =
      o.product_variant_id === null || o.product_variant_id === undefined
        ? undefined
        : typeof o.product_variant_id === "string" && UUID_RE.test(o.product_variant_id)
          ? o.product_variant_id
          : undefined;
    lines.push({
      product_id,
      quantity: Math.min(999, Math.floor(qty)),
      ...(variant ? { product_variant_id: variant } : {}),
    });
  }
  return { ok: true, lines };
}

/** Single message with URL — reliable for WhatsApp, Instagram DMs, SMS (Android avoids duplicate URL). */
function shareBookingPayload(url: string, opts?: { businessName?: string; shortLabel?: string }) {
  const name = opts?.shortLabel?.trim() || opts?.businessName?.trim();
  const line = name
    ? `Book with ${name} — tap to pick a time:\n${url}`
    : `Book online — tap to pick a time:\n${url}`;
  return Platform.OS === "ios"
    ? { message: line, url }
    : { message: line };
}

export default function ExpressBookingScreen() {
  const router = useRouter();
  const { data: link, loading, error: bookingLinkError, timedOut, refresh } = useApi<BookingLink>(
    "/api/provider/booking-link"
  );
  const { execute: updateLink, loading: saving } = useApiMutation("patch");
  const { execute: patchExpressLink, loading: savingPrefill } = useApiMutation<ExpressLinkRow>("patch");
  const [copied, setCopied] = useState(false);
  const [copiedShortId, setCopiedShortId] = useState<string | null>(null);
  const [customSlug, setCustomSlug] = useState("");
  const [editingSlug, setEditingSlug] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expressLinks, setExpressLinks] = useState<ExpressLinkRow[]>([]);
  const [expressLinksError, setExpressLinksError] = useState<string | null>(null);
  const [expressLinksLoading, setExpressLinksLoading] = useState(false);

  const [prefillModalLink, setPrefillModalLink] = useState<ExpressLinkRow | null>(null);
  const [prefillPromo, setPrefillPromo] = useState("");
  const [prefillGift, setPrefillGift] = useState("");
  const [prefillAddonsText, setPrefillAddonsText] = useState("");
  const [prefillProductsJson, setPrefillProductsJson] = useState("[]");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkSlug, setNewLinkSlug] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);

  useEffect(() => {
    if (!prefillModalLink) return;
    const p =
      prefillModalLink.prefill && typeof prefillModalLink.prefill === "object"
        ? prefillModalLink.prefill
        : {};
    setPrefillPromo((p.promotion_code ?? "").trim());
    setPrefillGift((p.gift_card_code ?? "").trim());
    setPrefillAddonsText(Array.isArray(p.addon_ids) ? p.addon_ids.join(", ") : "");
    setPrefillProductsJson(JSON.stringify(Array.isArray(p.product_cart) ? p.product_cart : [], null, 2));
  }, [prefillModalLink]);

  const loadExpressLinks = useCallback(async () => {
    setExpressLinksLoading(true);
    setExpressLinksError(null);
    setSubscriptionRequired(false);
    let list: ExpressLinkRow[] = [];
    let errorOut: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await api.get<ExpressLinkRow[] | { data?: ExpressLinkRow[]; code?: string }>(
          "/api/provider/express-booking"
        );
        if (!res.error) {
          const raw = res.data;
          const parsed = Array.isArray(raw) ? raw : (raw as { data?: ExpressLinkRow[] })?.data ?? [];
          list = Array.isArray(parsed) ? parsed : [];
          errorOut = null;
          break;
        }
        const errObj = res.error as { status?: number; code?: string; message?: string };
        const status = errObj.status;
        if (status === 403) {
          const bodyCode = errObj.code || (res.data as { code?: string })?.code;
          if (bodyCode === "SUBSCRIPTION_REQUIRED" || (errObj.message ?? "").toLowerCase().includes("subscription")) {
            setSubscriptionRequired(true);
            errorOut = null;
            break;
          }
        }
        errorOut = getApiErrorMessage(res.error, "Failed to load short links");
        if (status === 401 || status === 403) break;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 450));
      } catch (e) {
        errorOut = getApiErrorMessage(e, "Failed to load short links");
        if (attempt < 1) await new Promise((r) => setTimeout(r, 450));
      }
    }

    setExpressLinks(list);
    setExpressLinksError(errorOut);
    setExpressLinksLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadExpressLinks();
  }, [loading, loadExpressLinks]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      await loadExpressLinks();
    } finally {
      setRefreshing(false);
    }
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
      await Share.share(shareBookingPayload(link.url, { businessName: link.business_name }));
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

  async function handleSavePrefill() {
    if (!prefillModalLink) return;
    const parsedCart = parseProductCartJson(prefillProductsJson);
    if (!parsedCart.ok) {
      Alert.alert("Product cart", parsedCart.message);
      return;
    }
    const addon_ids = parseAddonIdsFromText(prefillAddonsText);
    const prefill: Record<string, unknown> = {};
    if (addon_ids.length > 0) prefill.addon_ids = addon_ids;
    if (prefillPromo.trim()) prefill.promotion_code = prefillPromo.trim();
    if (prefillGift.trim()) prefill.gift_card_code = prefillGift.trim();
    if (parsedCart.lines.length > 0) prefill.product_cart = parsedCart.lines;

    const { data: updatedLink, error } = await patchExpressLink(`/api/provider/express-booking/${prefillModalLink.id}`, { prefill });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setExpressLinks((current) =>
      current.map((link) =>
        link.id === prefillModalLink.id
          ? { ...link, ...(updatedLink ?? {}), prefill }
          : link
      )
    );
    setPrefillModalLink(null);
    void loadExpressLinks();
  }

  async function handleCreateExpressLink() {
    if (!newLinkName.trim() || !newLinkSlug.trim()) {
      setCreateError("Name and slug are required");
      return;
    }
    setCreatingLink(true);
    setCreateError(null);
    try {
      const res = await api.post<ExpressLinkRow>("/api/provider/express-booking", {
        name: newLinkName.trim(),
        slug: newLinkSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        is_active: true,
      });
      if (res.error) {
        setCreateError(getApiErrorMessage(res.error, "Failed to create express link"));
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (res.data) {
          setExpressLinks((current) => [res.data as ExpressLinkRow, ...current]);
        }
        setShowCreateForm(false);
        setNewLinkName("");
        setNewLinkSlug("");
        setCreateError(null);
        void loadExpressLinks();
      }
    } catch (e) {
      setCreateError(getApiErrorMessage(e, "Failed to create express link"));
    }
    setCreatingLink(false);
  }

  function handleClearPrefill() {
    if (!prefillModalLink) return;
    Alert.alert(
      "Clear checkout prefill",
      "Remove promo, gift card, add-ons, and product lines from this link?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const { data: updatedLink, error } = await patchExpressLink(`/api/provider/express-booking/${prefillModalLink.id}`, {
                prefill: {},
              });
              if (error) {
                Alert.alert("Error", error);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setExpressLinks((current) =>
                current.map((link) =>
                  link.id === prefillModalLink.id
                    ? { ...link, ...(updatedLink ?? {}), prefill: {} }
                    : link
                )
              );
              setPrefillModalLink(null);
              void loadExpressLinks();
            })();
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Share with clients"
        showBack
        subtitle="Copy or share for WhatsApp, Instagram, SMS"
      />

      {loading ? (
        <LoadingState fullScreen={false} />
      ) : (
        <>
          {bookingLinkError ? (
            <View
              style={{
                marginBottom: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#fecaca",
                backgroundColor: "#fef2f2",
                padding: 16,
              }}
              accessibilityLabel="Booking link error"
            >
              <Text style={{ fontSize: 14, color: "#991b1b", marginBottom: 8 }}>{bookingLinkError}</Text>
              {timedOut ? (
                <Text style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>
                  This is taking longer than usual. Check your connection and try again.
                </Text>
              ) : null}
              <TouchableOpacity
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 12,
                  backgroundColor: "#dc2626",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
                onPress={() => void refresh()}
                accessibilityLabel="Retry loading booking link"
                accessibilityRole="button"
              >
                <Text style={{ fontWeight: "600", color: Colors.white }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : null}

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
                One link for your booking page — easy to paste in chats or your bio
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

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
            <SectionHeader title="Express Links" />
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 12,
                backgroundColor: "#4f46e5",
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
              onPress={() => setShowCreateForm(true)}
              accessibilityLabel="Create new express link"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ marginLeft: 4, fontWeight: "600", color: Colors.white, fontSize: 13 }}>New Link</Text>
            </TouchableOpacity>
          </View>

          {showCreateForm && (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#c7d2fe", backgroundColor: "#f5f3ff", padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#4338ca", marginBottom: 12 }}>Create Express Link</Text>
              <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Name</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, backgroundColor: Colors.white, marginBottom: 10 }}
                placeholder="e.g. Summer Promo"
                placeholderTextColor="#9ca3af"
                value={newLinkName}
                onChangeText={(t) => {
                  setNewLinkName(t);
                  if (!newLinkSlug || newLinkSlug === newLinkName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) {
                    setNewLinkSlug(t.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                  }
                }}
                autoCapitalize="words"
              />
              <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Slug (URL-safe)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, backgroundColor: Colors.white, marginBottom: 10 }}
                placeholder="e.g. summer-promo"
                placeholderTextColor="#9ca3af"
                value={newLinkSlug}
                onChangeText={setNewLinkSlug}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {createError && (
                <View style={{ borderRadius: 8, backgroundColor: "#fef2f2", padding: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 13, color: "#991b1b" }}>{createError}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: "center", borderRadius: 12, backgroundColor: "#4f46e5", paddingVertical: 12, opacity: creatingLink ? 0.6 : 1 }}
                  onPress={() => void handleCreateExpressLink()}
                  disabled={creatingLink}
                  accessibilityLabel="Create express link"
                  accessibilityRole="button"
                >
                  {creatingLink ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ fontWeight: "600", color: Colors.white }}>Create</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], paddingVertical: 12 }}
                  onPress={() => { setShowCreateForm(false); setCreateError(null); }}
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                >
                  <Text style={{ fontWeight: "500", color: Colors.gray[600] }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {subscriptionRequired ? (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#fde68a",
                backgroundColor: "#fffbeb",
                padding: 20,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Ionicons name="lock-closed-outline" size={20} color="#b45309" />
                <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: "600", color: "#92400e" }}>
                  Upgrade Required
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: "#78350f", marginBottom: 12 }}>
                Express booking links are available on a paid subscription plan. Upgrade to unlock this feature.
              </Text>
              <TouchableOpacity
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 12,
                  backgroundColor: "#4f46e5",
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                }}
                onPress={() => router.push("/(app)/(tabs)/more/settings/subscription" as never)}
                accessibilityLabel="Go to subscription page"
                accessibilityRole="button"
              >
                <Text style={{ fontWeight: "600", color: Colors.white }}>View Plans</Text>
              </TouchableOpacity>
            </View>
          ) : expressLinksLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 }}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Loading express links…</Text>
            </View>
          ) : expressLinksError ? (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", padding: 16 }}>
              <Text style={{ fontSize: 14, color: "#991b1b" }}>{expressLinksError}</Text>
              <TouchableOpacity
                style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 12, backgroundColor: "#dc2626", paddingHorizontal: 16, paddingVertical: 8 }}
                onPress={() => void loadExpressLinks()}
                accessibilityLabel="Retry loading express links"
                accessibilityRole="button"
              >
                <Text style={{ fontWeight: "500", color: Colors.white }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : expressLinks.length === 0 && !showCreateForm ? (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                backgroundColor: Colors.white,
                padding: 20,
              }}
            >
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>
                No express links yet. Tap &quot;New Link&quot; above to create a pre-filled booking link you can share with clients.
              </Text>
            </View>
          ) : (
            <>
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
                              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8, flexWrap: "wrap" }}>
                                {el.location_type === "at_home" ? (
                                  <Text style={{ fontSize: 11, color: Colors.gray[500] }}>At home</Text>
                                ) : el.location_type === "at_salon" || el.location_id ? (
                                  <Text style={{ fontSize: 11, color: Colors.gray[500] }}>At salon</Text>
                                ) : (
                                  <Text style={{ fontSize: 11, color: Colors.gray[400] }}>Any venue</Text>
                                )}
                                {el.use_count != null && (
                                  <Text style={{ fontSize: 12, color: Colors.gray[400] }}>{el.use_count} click{el.use_count !== 1 ? "s" : ""}</Text>
                                )}
                              </View>
                            </View>
                            <View style={{ flexDirection: "row" }}>
                              <TouchableOpacity
                                style={{ marginRight: 8, borderRadius: 8, backgroundColor: "#ede9fe", paddingHorizontal: 12, paddingVertical: 8 }}
                                onPress={() => setPrefillModalLink(el)}
                                accessibilityLabel="Edit checkout prefill for short link"
                                accessibilityRole="button"
                              >
                                <Ionicons name="pricetag-outline" size={18} color="#6d28d9" />
                              </TouchableOpacity>
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
                                onPress={() => Share.share(shareBookingPayload(fullUrl, { shortLabel: el.name }))}
                                accessibilityLabel="Share short link"
                                accessibilityRole="button"
                              >
                                <Ionicons name="share-outline" size={18} color="#6b7280" />
                              </TouchableOpacity>
                              {APP_URL ? (
                                <TouchableOpacity
                                  style={{ marginRight: 8, borderRadius: 8, backgroundColor: "#e0e7ff", paddingHorizontal: 12, paddingVertical: 8 }}
                                  onPress={() => router.push("/(app)/(tabs)/more/settings/booking-link" as never)}
                                  accessibilityLabel="Manage links"
                                  accessibilityRole="button"
                                >
                                  <Ionicons name="settings-outline" size={18} color="#6366f1" />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
            </>
          )}

          <View style={{ height: 32 }} />
        </>
      )}

      <Modal
        visible={prefillModalLink != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPrefillModalLink(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: "#fff" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingTop: Platform.OS === "ios" ? 16 : 24,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: Colors.gray[100],
            }}
          >
            <TouchableOpacity onPress={() => setPrefillModalLink(null)} accessibilityLabel="Close" accessibilityRole="button">
              <Text style={{ fontSize: 16, color: Colors.gray[600] }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
              Checkout prefill
            </Text>
            <TouchableOpacity
              onPress={() => void handleSavePrefill()}
              disabled={savingPrefill}
              accessibilityLabel="Save prefill"
              accessibilityRole="button"
            >
              {savingPrefill ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.primary }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {prefillModalLink ? (
              <>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900], marginBottom: 4 }}>{prefillModalLink.name}</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 16 }}>
                  Optional fields applied when clients open this short link (add-ons, promo, gift card, retail products).
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700], marginBottom: 6 }}>Promo code</Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    marginBottom: 14,
                    backgroundColor: Colors.gray[50],
                  }}
                  placeholder="SUMMER20"
                  placeholderTextColor="#9ca3af"
                  value={prefillPromo}
                  onChangeText={setPrefillPromo}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700], marginBottom: 6 }}>Gift card code</Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    marginBottom: 14,
                    backgroundColor: Colors.gray[50],
                  }}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                  value={prefillGift}
                  onChangeText={setPrefillGift}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700], marginBottom: 6 }}>Add-on IDs (UUIDs)</Text>
                <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 6 }}>Comma or space separated</Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 14,
                    marginBottom: 14,
                    backgroundColor: Colors.gray[50],
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  }}
                  placeholder="uuid, uuid, …"
                  placeholderTextColor="#9ca3af"
                  value={prefillAddonsText}
                  onChangeText={setPrefillAddonsText}
                  autoCapitalize="none"
                  multiline
                />
                <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[700], marginBottom: 6 }}>Product cart (JSON)</Text>
                <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 6 }}>
                  JSON array: product_id (UUID), quantity (1–999), optional product_variant_id.
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 13,
                    marginBottom: 20,
                    backgroundColor: Colors.gray[50],
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    minHeight: 120,
                    textAlignVertical: "top",
                  }}
                  value={prefillProductsJson}
                  onChangeText={setPrefillProductsJson}
                  autoCapitalize="none"
                  multiline
                />
                <TouchableOpacity
                  style={{
                    alignSelf: "flex-start",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#fecaca",
                    backgroundColor: "#fef2f2",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                  onPress={handleClearPrefill}
                  disabled={savingPrefill}
                  accessibilityLabel="Clear all prefill"
                  accessibilityRole="button"
                >
                  <Text style={{ fontWeight: "600", color: "#b91c1c" }}>Clear all prefill</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}
