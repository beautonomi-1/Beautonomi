import { useEffect, useMemo, useState } from "react";
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

type GlobalCategory = { id: string; name: string };
type AvailabilitySlot = { start: string; end?: string; is_available?: boolean; staff_id?: string | null };

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
  const [serviceCategoryId, setServiceCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [preferredStartAt, setPreferredStartAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const addImage = async () => {
    if (imageUrls.length >= 6) return;
    setUploading(true);
    try {
      const result = await pickFromLibrary();
      if (!result) {
        setUploading(false);
        return;
      }
      const formData = new FormData();
      appendFormDataFileNative(formData, "files", {
        uri: result.uri,
        name: result.fileName || "image.jpg",
        type: result.mimeType || "image/jpeg",
      });
      const res = await api.fetch<{ urls?: string[] }>("/api/me/custom-requests/upload", {
        method: "POST",
        body: formData,
      });
      if (res.error) {
        Alert.alert("Upload failed", getApiErrorMessage(res.error, "Could not upload image. Please try again."));
        return;
      }
      const urls = (res.data as { urls?: string[] } | null)?.urls ?? [];
      if (urls.length > 0) {
        setImageUrls((prev) => [...prev, ...urls].slice(0, 6));
      } else {
        Alert.alert("Upload issue", "Image uploaded but could not be processed. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!provider_id) {
      Alert.alert("Error", "Provider not specified. Please go back and try again.");
      return;
    }
    if (!user) return;
    const desc = description.trim();
    if (desc.length < 10) {
      Alert.alert("Description required", "Please describe your request (at least 10 characters)");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/api/me/custom-requests", {
        provider_id,
        description: desc,
        budget_min: budgetMin ? parseFloat(budgetMin) : null,
        budget_max: budgetMax ? parseFloat(budgetMax) : null,
        service_category_id: serviceCategoryId,
        preferred_start_at: preferredStartAt,
        duration_minutes: parseInt(duration, 10) || 60,
        location_type: locationType,
        image_urls: imageUrls,
      });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to submit");
      } else {
        haptic.success();
        const result = res.data as { conversation_id?: string } | null;
        const conversationId = result?.conversation_id;
        Alert.alert(
          "Submitted",
          "Your custom request has been sent. The provider will respond soon.",
          [
            {
              text: conversationId ? "Go to Chat" : "OK",
              onPress: () => {
                if (conversationId) {
                  router.replace({ pathname: "/(app)/chat", params: { id: conversationId } });
                } else {
                  router.back();
                }
              },
            },
            ...(conversationId
              ? [{ text: "Later", style: "cancel" as const, onPress: () => router.back() }]
              : []),
          ],
        );
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: Colors.gray[600] }}>Log in to make a custom request</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Custom Request" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
      <ScrollView style={{ flex: 1, backgroundColor: Colors.white }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>Describe what you&apos;re looking for (min 10 characters)</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 100, fontSize: 16 }}
          placeholder="E.g. I need a bridal makeup look for my wedding in 2 weeks. I'd like a natural glow with soft pink tones..."
          placeholderTextColor={Colors.gray[400]}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
        />
        {categories.length > 0 && (
          <>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Service category (optional)</Text>
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
                  <Text style={{ fontSize: 13, fontWeight: "600", color: serviceCategoryId == null ? Colors.primary : Colors.gray[600] }}>Any category</Text>
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
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Budget (optional)</Text>
        <View style={{ flexDirection: "row" }}>
          <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginRight: 12 }} placeholder="Min" placeholderTextColor={Colors.gray[400]} value={budgetMin} onChangeText={setBudgetMin} keyboardType="numeric" />
          <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }} placeholder="Max" placeholderTextColor={Colors.gray[400]} value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" />
        </View>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Duration (minutes)</Text>
        <TextInput style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }} placeholder="60" placeholderTextColor={Colors.gray[400]} value={duration} onChangeText={setDuration} keyboardType="numeric" />
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Where?</Text>
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity onPress={() => setLocationType("at_salon")} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: locationType === "at_salon" ? Colors.primary : Colors.gray[200], backgroundColor: locationType === "at_salon" ? Colors.primaryLight : "transparent", marginRight: 12 }}>
            <Text style={{ textAlign: "center", fontWeight: "500", color: locationType === "at_salon" ? Colors.primary : Colors.gray[700] }}>At salon</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLocationType("at_home")} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: locationType === "at_home" ? Colors.primary : Colors.gray[200], backgroundColor: locationType === "at_home" ? Colors.primaryLight : "transparent" }}>
            <Text style={{ textAlign: "center", fontWeight: "500", color: locationType === "at_home" ? Colors.primary : Colors.gray[700] }}>At home</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Preferred date and time</Text>
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 8 }}>
          Pick from this provider&apos;s available slots. They may still propose a different time in their offer.
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
            <Text style={{ fontSize: 13, color: Colors.gray[500] }}>Loading available times...</Text>
          ) : slots.length === 0 ? (
            <Text style={{ fontSize: 13, color: "#B45309" }}>No available slots for this date. Try another day or duration.</Text>
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
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Inspiration photos (optional, max 6)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {imageUrls.map((url, i) => (
            <View key={i} style={{ position: "relative", marginRight: 8, marginBottom: 8 }}>
              <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              <Pressable onPress={() => removeImage(i)} style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, backgroundColor: "#EF4444", borderRadius: 10, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: Colors.white, fontSize: 12 }}>×</Text>
              </Pressable>
            </View>
          ))}
          {imageUrls.length < 6 && (
            <TouchableOpacity onPress={addImage} disabled={uploading} style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderStyle: "dashed", borderColor: Colors.gray[300], alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 8 }}>
              {uploading ? <ActivityIndicator size="small" /> : <Text style={{ color: Colors.gray[500], fontSize: 24 }}>+</Text>}
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={submit} disabled={submitting} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 }}>
          {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>Submit request</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
