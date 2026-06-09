import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "@beautonomi/i18n";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { haptic } from "@/lib/haptics";
import { Colors } from "@/constants/colors";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { getApiErrorMessage } from "@/lib/api-error";
import { AddressPicker, type AddressPickerSelection } from "@/components/AddressPicker";
import { resolveDefaultCountryName } from "@/lib/market-country";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { Ionicons } from "@expo/vector-icons";

type GlobalCategory = { id: string; name: string };
type AvailabilitySlot = { start: string; end?: string; is_available?: boolean; staff_id?: string | null };

/**
 * §custom-request-mobile-upload 2026-05: keep the mobile rules in sync with
 * the server validation in /api/me/custom-requests/upload so the user gets a
 * fast, local error instead of a wasted multipart round-trip.
 */
const ALLOWED_IMAGE_MIME_TYPES: ReadonlyArray<string> = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 6;
/** Matches the server zod schema (`duration_minutes` between 15 and 8h). */
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 8 * 60;

function inferMimeTypeFromName(name: string | undefined | null): string | null {
  if (!name) return null;
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function labelDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function labelTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(11, 16);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function normalizeCategories(raw: unknown): GlobalCategory[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw as GlobalCategory[];
  const root = raw as { data?: unknown; global_categories?: unknown };
  if (Array.isArray(root.global_categories)) return root.global_categories as GlobalCategory[];
  if (Array.isArray(root.data)) return root.data as GlobalCategory[];
  if (root.data && typeof root.data === "object" && Array.isArray((root.data as { categories?: unknown }).categories)) {
    return (root.data as { categories: GlobalCategory[] }).categories;
  }
  return [];
}

function normalizeSlots(raw: unknown): AvailabilitySlot[] {
  const root = raw as { slots?: unknown; data?: { slots?: unknown } } | null | undefined;
  const slots = Array.isArray(root?.slots) ? root?.slots : Array.isArray(root?.data?.slots) ? root?.data?.slots : [];
  return (slots as AvailabilitySlot[]).filter((slot) => typeof slot.start === "string");
}

export default function CustomRequestCreateScreen() {
  useScreenTracking("Custom Request Create");
  const { t } = useTranslation();
  const cr = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.customRequestCreate.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const { provider_id } = useLocalSearchParams<{ provider_id: string }>();
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const { pickFromLibrary } = useImagePicker();
  const [description, setDescription] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [duration, setDuration] = useState("60");
  const [locationType, setLocationType] = useState<"at_salon" | "at_home">("at_salon");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [atHomeCoords, setAtHomeCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const { bundle } = useConfigBundle();
  const defaultCountryName = resolveDefaultCountryName(bundle?.meta ?? null);
  const [serviceCategoryId, setServiceCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [preferredStartAt, setPreferredStartAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<unknown>("/api/public/categories/global").then((res) => {
      if (cancelled || res.error) return;
      setCategories(normalizeCategories(res.data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!provider_id) return;
    const durationMinutes = parseInt(duration, 10) || 60;
    if (durationMinutes < 15) return;
    let cancelled = false;
    setLoadingSlots(true);
    const params = new URLSearchParams({
      date: selectedDate,
      duration_minutes: String(durationMinutes),
      staff_id: "any",
      travel_buffer_minutes: locationType === "at_home" ? "30" : "0",
    });
    api
      .get<unknown>(`/api/public/providers/${encodeURIComponent(provider_id)}/availability?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setSlots([]);
          return;
        }
        const nextSlots = normalizeSlots(res.data).filter((slot) => slot.is_available !== false);
        setSlots(nextSlots);
        if (nextSlots.length > 0 && !nextSlots.some((slot) => slot.start === preferredStartAt)) {
          setPreferredStartAt(nextSlots[0].start);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [duration, locationType, preferredStartAt, provider_id, selectedDate]);

  const addImage = useCallback(async () => {
    if (imageUrls.length >= MAX_IMAGE_COUNT) {
      setUploadError(cr("uploadLimitReached"));
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const result = await pickFromLibrary();
      if (!result) return;

      const resolvedMime =
        (result.mimeType && result.mimeType.toLowerCase()) ||
        inferMimeTypeFromName(result.fileName) ||
        "image/jpeg";

      if (!ALLOWED_IMAGE_MIME_TYPES.includes(resolvedMime)) {
        setUploadError(cr("uploadUnsupportedType"));
        return;
      }

      if (typeof result.fileSize === "number" && result.fileSize > MAX_IMAGE_BYTES) {
        setUploadError(cr("uploadTooLarge"));
        return;
      }

      const formData = new FormData();
      appendFormDataFileNative(formData, "files", {
        uri: result.uri,
        name: result.fileName || "image.jpg",
        type: resolvedMime,
      });
      const res = await api.fetch<{
        urls?: string[];
        partial?: boolean;
        failed?: { name: string; reason: string }[];
      }>("/api/me/custom-requests/upload", {
        method: "POST",
        body: formData,
      });
      if (res.error) {
        setUploadError(getApiErrorMessage(res.error, cr("uploadFailedFallback")));
        return;
      }
      const payload = res.data ?? null;
      const urls = payload?.urls ?? [];
      if (urls.length > 0) {
        setImageUrls((prev) => [...prev, ...urls].slice(0, MAX_IMAGE_COUNT));
        if (payload?.partial) {
          setUploadError(cr("uploadPartialSuccess"));
        }
      } else {
        setUploadError(cr("uploadProcessedBody"));
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : cr("uploadImageFailedBody"));
    } finally {
      setUploading(false);
    }
  }, [cr, imageUrls.length, pickFromLibrary]);

  const removeImage = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddressPickerSelect = useCallback((selection: AddressPickerSelection) => {
    if (selection.structured) {
      setAddressLine1(selection.structured.address_line1);
      setAddressLine2(selection.structured.address_line2 ?? "");
      setAddressCity(selection.structured.city);
      setAddressState(selection.structured.state ?? "");
      setAddressPostalCode(selection.structured.postal_code ?? "");
      setAddressCountry(selection.structured.country || defaultCountryName);
    } else {
      const parts = (selection.displayName || selection.label || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      setAddressLine1(parts[0] || selection.label || "");
      setAddressCity(parts[1] || "");
      setAddressCountry(defaultCountryName);
    }
    setAtHomeCoords({ latitude: selection.latitude, longitude: selection.longitude });
    setAddressPickerVisible(false);
  }, [defaultCountryName]);

  const submit = async () => {
    if (!provider_id) {
      setSubmitError(cr("providerMissingBody"));
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), cr("providerMissingBody"));
      return;
    }
    if (!user) return;
    const desc = description.trim();
    if (desc.length < 10) {
      setSubmitError(cr("descriptionRequiredBody"));
      Alert.alert(cr("descriptionRequiredTitle"), cr("descriptionRequiredBody"));
      return;
    }

    const parsedBudgetMin = budgetMin.trim() ? parseFloat(budgetMin) : null;
    const parsedBudgetMax = budgetMax.trim() ? parseFloat(budgetMax) : null;
    if (parsedBudgetMin != null && (!Number.isFinite(parsedBudgetMin) || parsedBudgetMin < 0)) {
      setSubmitError(cr("budgetInvalid"));
      Alert.alert(cr("budgetInvalidTitle"), cr("budgetInvalid"));
      return;
    }
    if (parsedBudgetMax != null && (!Number.isFinite(parsedBudgetMax) || parsedBudgetMax < 0)) {
      setSubmitError(cr("budgetInvalid"));
      Alert.alert(cr("budgetInvalidTitle"), cr("budgetInvalid"));
      return;
    }
    if (parsedBudgetMin != null && parsedBudgetMax != null && parsedBudgetMax < parsedBudgetMin) {
      setSubmitError(cr("budgetMaxLessThanMin"));
      Alert.alert(cr("budgetInvalidTitle"), cr("budgetMaxLessThanMin"));
      return;
    }

    const parsedDuration = parseInt(duration, 10);
    const durationMinutes = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 60;
    if (durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
      const msg = cr("durationOutOfRange", {
        min: MIN_DURATION_MINUTES,
        max: MAX_DURATION_MINUTES,
      });
      setSubmitError(msg);
      Alert.alert(cr("budgetInvalidTitle"), msg);
      return;
    }

    if (locationType === "at_home" && (!addressLine1.trim() || !addressCity.trim())) {
      const msg = cr("addressRequiredBody");
      setSubmitError(msg);
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), msg);
      return;
    }
    if (locationType === "at_home" && !atHomeCoords) {
      const msg = cr("addressCoordsRequiredBody", { defaultValue: "Select your address using search, current location, or the map pin so we can locate you." });
      setSubmitError(msg);
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), msg);
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{
        conversation_id?: string;
        attachment_warning?: string;
        message_warning?: string;
      }>("/api/me/custom-requests", {
        provider_id,
        description: desc,
        budget_min: parsedBudgetMin,
        budget_max: parsedBudgetMax,
        service_category_id: serviceCategoryId,
        preferred_start_at: preferredStartAt,
        duration_minutes: durationMinutes,
        location_type: locationType,
        address_line1: locationType === "at_home" ? addressLine1 : undefined,
        address_line2: locationType === "at_home" ? addressLine2 : undefined,
        address_city: locationType === "at_home" ? addressCity : undefined,
        address_state: locationType === "at_home" ? addressState : undefined,
        address_postal_code: locationType === "at_home" ? addressPostalCode : undefined,
        address_country: locationType === "at_home" ? (addressCountry.trim() || defaultCountryName) : undefined,
        image_urls: imageUrls,
      });
      if (res.error) {
        const msg = getApiErrorMessage(res.error, cr("submitFailed"));
        setSubmitError(msg);
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), msg);
        return;
      }
      haptic.success();
      const result = res.data ?? null;
      const conversationId = result?.conversation_id;
      const partialNotice = result?.attachment_warning
        ? `\n\n${cr("submittedPartialImages")}`
        : "";
      Alert.alert(
        cr("submittedTitle"),
        `${cr("submittedBody")}${partialNotice}`,
        [
          {
            text: conversationId ? cr("goToChat") : t("common.ok"),
            onPress: () => {
              if (conversationId) {
                router.replace({ pathname: "/(app)/chat", params: { id: conversationId } });
              } else {
                router.back();
              }
            },
          },
          ...(conversationId
            ? [{ text: cr("later"), style: "cancel" as const, onPress: () => router.back() }]
            : []),
        ],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : cr("submitFailed");
      setSubmitError(msg);
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: Colors.gray[600] }}>{cr("loginPrompt")}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t("customer.mobile.stackTitles.customRequest") }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
      <ScrollView style={{ flex: 1, backgroundColor: Colors.white }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>{cr("describeHint")}</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 100, fontSize: 16 }}
          placeholder={cr("briefPlaceholder")}
          placeholderTextColor={Colors.gray[400]}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
        />
        {categories.length > 0 && (
          <>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>{cr("serviceCategoryOptional")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={() => setServiceCategoryId(null)}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: serviceCategoryId == null ? Colors.primary : Colors.gray[200],
                    backgroundColor: serviceCategoryId == null ? Colors.primaryLight : Colors.white,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    marginRight: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: serviceCategoryId == null ? Colors.primary : Colors.gray[600] }}>{cr("anyCategory")}</Text>
                </TouchableOpacity>
                {categories.map((category) => {
                  const active = serviceCategoryId === category.id;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      onPress={() => setServiceCategoryId(active ? null : category.id)}
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? Colors.primary : Colors.gray[200],
                        backgroundColor: active ? Colors.primaryLight : Colors.white,
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        marginRight: 8,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: active ? Colors.primary : Colors.gray[600] }}>{category.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </>
        )}
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>{cr("budgetOptionalLabel")}</Text>
        <View style={{ flexDirection: "row" }}>
          <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginRight: 12 }} placeholder={cr("budgetMin")} placeholderTextColor={Colors.gray[400]} value={budgetMin} onChangeText={setBudgetMin} keyboardType="numeric" />
          <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }} placeholder={cr("budgetMax")} placeholderTextColor={Colors.gray[400]} value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" />
        </View>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>{cr("durationLabel")}</Text>
        <TextInput style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }} placeholder={cr("durationPlaceholder")} placeholderTextColor={Colors.gray[400]} value={duration} onChangeText={setDuration} keyboardType="numeric" />
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>{cr("whereLabel")}</Text>
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity onPress={() => setLocationType("at_salon")} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: locationType === "at_salon" ? Colors.primary : Colors.gray[200], backgroundColor: locationType === "at_salon" ? Colors.primaryLight : "transparent", marginRight: 12 }}>
            <Text style={{ textAlign: "center", fontWeight: "500", color: locationType === "at_salon" ? Colors.primary : Colors.gray[700] }}>{cr("atSalon")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLocationType("at_home")} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: locationType === "at_home" ? Colors.primary : Colors.gray[200], backgroundColor: locationType === "at_home" ? Colors.primaryLight : "transparent" }}>
            <Text style={{ textAlign: "center", fontWeight: "500", color: locationType === "at_home" ? Colors.primary : Colors.gray[700] }}>{cr("atHome")}</Text>
          </TouchableOpacity>
        </View>
        
        {locationType === "at_home" && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>{cr("addressLabel", { defaultValue: "Your address" })}</Text>
            <TouchableOpacity
              onPress={() => {
                haptic.light();
                setAddressPickerVisible(true);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: Colors.primary,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                marginBottom: 12,
                backgroundColor: Colors.primaryLight,
              }}
            >
              <Ionicons name="search-outline" size={18} color={Colors.primary} />
              <Text style={{ marginLeft: 10, fontSize: 14, fontWeight: "600", color: Colors.primary }}>
                {cr("searchAddress", { defaultValue: "Search or use current location" })}
              </Text>
            </TouchableOpacity>
            <TextInput style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }} placeholder={cr("addressLine1", { defaultValue: "Street address" })} placeholderTextColor={Colors.gray[400]} value={addressLine1} onChangeText={setAddressLine1} />
            <TextInput style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }} placeholder={cr("addressLine2", { defaultValue: "Unit / Suite (optional)" })} placeholderTextColor={Colors.gray[400]} value={addressLine2} onChangeText={setAddressLine2} />
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginRight: 8 }} placeholder={cr("addressCity", { defaultValue: "City" })} placeholderTextColor={Colors.gray[400]} value={addressCity} onChangeText={setAddressCity} />
              <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }} placeholder={cr("addressPostalCode", { defaultValue: "Postal Code" })} placeholderTextColor={Colors.gray[400]} value={addressPostalCode} onChangeText={setAddressPostalCode} />
            </View>
            <TextInput style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }} placeholder={cr("addressState", { defaultValue: "Province / State" })} placeholderTextColor={Colors.gray[400]} value={addressState} onChangeText={setAddressState} />
            {atHomeCoords ? (
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                {cr("addressPinned", { defaultValue: "Location pinned on map" })}
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: "#B45309" }}>
                {cr("addressCoordsHint", { defaultValue: "Use search, current location, or map pin to set your location." })}
              </Text>
            )}
          </View>
        )}

        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>{cr("preferredDateTimeLabel")}</Text>
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 8 }}>
          {cr("slotsHint")}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row" }}>
            {dateOptions.map((d) => {
              const key = dateKey(d);
              const active = selectedDate === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSelectedDate(key)}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? "#059669" : Colors.gray[200],
                    backgroundColor: active ? "#ECFDF5" : Colors.white,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    marginRight: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#047857" : Colors.gray[700] }}>{labelDate(d)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}>
          {loadingSlots ? (
            <Text style={{ fontSize: 13, color: Colors.gray[500] }}>{cr("loadingSlots")}</Text>
          ) : slots.length === 0 ? (
            <Text style={{ fontSize: 13, color: "#B45309" }}>{cr("noSlotsMessage")}</Text>
          ) : (
            slots.slice(0, 30).map((slot) => {
              const active = preferredStartAt === slot.start;
              return (
                <TouchableOpacity
                  key={slot.start}
                  onPress={() => setPreferredStartAt(slot.start)}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "#047857" : "#A7F3D0",
                    backgroundColor: active ? "#059669" : "#ECFDF5",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginRight: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? Colors.white : "#047857" }}>{labelTime(slot.start)}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 4 }}>{cr("inspirationPhotosLabel")}</Text>
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 8 }}>
          {cr("inspirationPhotosHelper", { max: MAX_IMAGE_COUNT })}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {imageUrls.map((url, i) => (
            <View key={i} style={{ position: "relative", marginRight: 8, marginBottom: 8 }}>
              <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              <Pressable
                onPress={() => removeImage(i)}
                accessibilityRole="button"
                accessibilityLabel={cr("removePhotoA11y")}
                style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, backgroundColor: "#EF4444", borderRadius: 10, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: Colors.white, fontSize: 12 }}>×</Text>
              </Pressable>
            </View>
          ))}
          {imageUrls.length < MAX_IMAGE_COUNT && (
            <TouchableOpacity
              onPress={addImage}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel={cr("addPhotoA11y")}
              style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderStyle: "dashed", borderColor: uploadError ? "#EF4444" : Colors.gray[300], alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 8 }}
            >
              {uploading ? <ActivityIndicator size="small" /> : <Text style={{ color: Colors.gray[500], fontSize: 24 }}>+</Text>}
            </TouchableOpacity>
          )}
        </View>
        {uploadError ? (
          <View
            style={{
              marginTop: 4,
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#FEF2F2",
              borderWidth: 1,
              borderColor: "#FECACA",
            }}
          >
            <Text style={{ color: "#B91C1C", fontSize: 13, marginBottom: 8 }}>{uploadError}</Text>
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                onPress={addImage}
                disabled={uploading || imageUrls.length >= MAX_IMAGE_COUNT}
                accessibilityRole="button"
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: Colors.primary,
                  marginRight: 8,
                  opacity: uploading || imageUrls.length >= MAX_IMAGE_COUNT ? 0.6 : 1,
                }}
              >
                <Text style={{ color: Colors.white, fontSize: 12, fontWeight: "600" }}>
                  {cr("retryUpload")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setUploadError(null)}
                accessibilityRole="button"
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: "#FECACA",
                }}
              >
                <Text style={{ color: "#B91C1C", fontSize: 12, fontWeight: "600" }}>
                  {cr("dismiss")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {submitError ? (
          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#FEF2F2",
              borderWidth: 1,
              borderColor: "#FECACA",
            }}
          >
            <Text style={{ color: "#B91C1C", fontSize: 13 }}>{submitError}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
          style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24, opacity: submitting ? 0.75 : 1 }}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>
              {submitError ? cr("retrySubmit") : cr("submitCta")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
      <AddressPicker
        visible={addressPickerVisible}
        onClose={() => setAddressPickerVisible(false)}
        onSelect={handleAddressPickerSelect}
        onUseCurrentLocation={() => setAddressPickerVisible(false)}
      />
    </>
  );
}
