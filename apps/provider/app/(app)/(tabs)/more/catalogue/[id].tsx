import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
  type ImageStyle,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency } from "@/lib/format";
import { APP_URL, withWebApiTenantHeaders } from "@/config/public-env";
import { supabase } from "@/lib/supabase/client";
import { twStyle } from "@/lib/twStyle";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { launchImageLibraryWithPermission } from "@/lib/native-permissions";

interface ServiceDetail {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes?: number;
  price: number;
  currency: string;
  is_active: boolean;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  at_home_radius_km?: number;
  at_home_price_adjustment?: number;
  provider_categories?: { name: string; color: string; description: string }[];
  provider_category_id?: string | null;
  team_member_ids?: string[] | null;
  image_url?: string | null;
  pricing_options?: Array<{ duration?: number; price?: number; pricingName?: string }>;
  created_at: string;
  updated_at: string;
}

interface ServiceCategoryRow {
  id: string;
  name: string;
  color?: string | null;
}

interface CategoriesApiShape {
  own_categories?: ServiceCategoryRow[];
}

interface StaffMemberRow {
  id: string;
  name: string;
  email?: string;
}

interface FormState {
  title: string;
  description: string;
  duration_minutes: string;
  price: string;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  at_home_price_adjustment: string;
  at_home_radius_km: string;
  is_active: boolean;
  category_id: string;
  team_member_ids: string[];
}

function initForm(service: ServiceDetail): FormState {
  return {
    title: service.title,
    description: service.description ?? "",
    duration_minutes: String(service.duration_minutes),
    price: String(service.price),
    supports_at_home: service.supports_at_home,
    supports_at_salon: service.supports_at_salon,
    at_home_price_adjustment: String(service.at_home_price_adjustment ?? 0),
    at_home_radius_km: String(service.at_home_radius_km ?? 0),
    is_active: service.is_active,
    category_id: service.provider_category_id ?? "",
    team_member_ids: Array.isArray(service.team_member_ids) ? [...service.team_member_ids] : [],
  };
}

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isTablet } = useResponsive();
  const [deletingService, setDeletingService] = useState(false);

  const {
    data: service,
    loading,
    error: serviceError,
    refresh,
  } = useApi<ServiceDetail>(`/api/provider/services/${id}`);
  const { execute: updateService, loading: saving } = useApiMutation("patch");
  const { execute: deleteItem } = useApiMutation("delete");

  const { data: categoriesRes, refresh: refreshCategories } = useApi<
    CategoriesApiShape | ServiceCategoryRow[] | { data?: CategoriesApiShape }
  >("/api/provider/categories");
  const { data: staffData } = useApi<StaffMemberRow[] | { data?: StaffMemberRow[] }>(
    "/api/provider/staff",
  );
  const { execute: createCategoryApi } = useApiPost<Record<string, string>, { id?: string }>(
    "/api/provider/categories",
  );

  const categories = useMemo<ServiceCategoryRow[]>(() => {
    if (!categoriesRes) return [];
    if (Array.isArray(categoriesRes)) return categoriesRes;
    const wrapped = categoriesRes as { data?: CategoriesApiShape };
    if (wrapped.data?.own_categories) return wrapped.data.own_categories;
    const direct = categoriesRes as CategoriesApiShape;
    return Array.isArray(direct.own_categories) ? direct.own_categories : [];
  }, [categoriesRes]);

  const staff = useMemo<StaffMemberRow[]>(() => {
    if (!staffData) return [];
    if (Array.isArray(staffData)) return staffData;
    const w = staffData as { data?: StaffMemberRow[] };
    return Array.isArray(w.data) ? w.data : [];
  }, [staffData]);

  const handleCreateCategory = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const { data, error } = await createCategoryApi({ name: trimmed });
      if (error) {
        Alert.alert("Error", error);
        return null;
      }
      await refreshCategories();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const newId =
        data && typeof data === "object" && "id" in data && typeof (data as { id: unknown }).id === "string"
          ? (data as { id: string }).id
          : null;
      return newId ? { value: newId, label: trimmed } : null;
    },
    [createCategoryApi, refreshCategories],
  );

  const [form, setForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handlePickServiceImage() {
    if (!editing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await launchImageLibraryWithPermission(
      {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.8,
      },
      {
        title: "Permission Required",
        message: "Please allow access to your photo library to upload images.",
      },
    );

    if (!result) return;
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const formData = new FormData();
      appendFormDataFileNative(formData, "file", {
        uri: asset.uri,
        name: asset.fileName ?? "service-photo.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
      formData.append("folder", "services");

      const uploadRes = await fetch(
        `${APP_URL}/api/upload`,
        withWebApiTenantHeaders({
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }),
      );

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Upload failed");
      }

      const uploadJson = await uploadRes.json();
      const imageUrl = uploadJson.data?.url;

      if (!imageUrl) throw new Error("No URL returned from upload");

      const { error: patchErr } = await updateService(`/api/provider/services/${id}`, {
        image_url: imageUrl,
      });

      if (patchErr) {
        Alert.alert("Error", "Image uploaded but could not update service. Please try again.");
        return;
      }

      refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Upload Error", err.message ?? "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  useEffect(() => {
    if (!service) return;
    if (!editing) setForm(initForm(service));
  }, [service, editing]);

  if (loading && !service) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }
  if (!service) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Service" showBack />
        {serviceError ? (
          <ErrorState message="Could not load service. Please try again." onRetry={refresh} />
        ) : (
          <EmptyState title="Service not found" />
        )}
      </ScreenContainer>
    );
  }

  function updateForm(field: keyof FormState, value: string | boolean) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form!.title.trim()) newErrors.title = "Title is required";
    if (!form!.price || Number(form!.price) <= 0)
      newErrors.price = "Valid price required";
    if (!form!.duration_minutes || Number(form!.duration_minutes) <= 0)
      newErrors.duration_minutes = "Valid duration required";
    if (!form!.category_id.trim()) newErrors.category_id = "Category is required";
    if (!form!.supports_at_home && !form!.supports_at_salon)
      newErrors.location = "Select at least one location type";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave() {
    if (!form || !validate()) return;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      duration_minutes: Number(form.duration_minutes),
      price: Number(form.price),
      supports_at_home: form.supports_at_home,
      supports_at_salon: form.supports_at_salon,
      at_home_price_adjustment: form.supports_at_home
        ? Number(form.at_home_price_adjustment) || 0
        : 0,
      at_home_radius_km: form.supports_at_home
        ? Number(form.at_home_radius_km) || 0
        : 0,
      is_active: form.is_active,
      provider_category_id: form.category_id.trim(),
      team_member_ids: form.team_member_ids,
    };
    const { error } = await updateService(
      `/api/provider/services/${id}`,
      payload
    );
    if (error) {
      Alert.alert("Error", error);
    } else {
      setEditing(false);
      await refresh();
      Alert.alert("Success", "Service updated successfully");
    }
  }

  function handleCancelEdit() {
    setForm(initForm(service!));
    setEditing(false);
    setErrors({});
  }

  function handleDeleteService() {
    if (!id || !service) return;
    Alert.alert(
      "Delete service",
      `Remove "${service.title}" from your catalogue? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingService(true);
            try {
              const { error } = await deleteItem(`/api/provider/services/${id}`);
              if (error) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert("Could not delete", error);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } finally {
              setDeletingService(false);
            }
          },
        },
      ],
    );
  }

  function renderFormField(
    label: string,
    field: keyof FormState,
    keyboardType: "default" | "numeric" = "default",
    multiline = false,
    suffix?: string
  ) {
    const value = form?.[field];
    const isString = typeof value === "string";
    return (
      <View style={twStyle("mb-4")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          {label}
        </Text>
        <View style={twStyle("flex-row items-center")}>
          <TextInput
            style={twStyle(`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${
              errors[field] ? "border-red-300" : "border-gray-200"
            } ${multiline ? "min-h-[80px]" : ""}`)}
            value={isString ? (value as string) : ""}
            onChangeText={(v) => updateForm(field, v)}
            keyboardType={keyboardType}
            multiline={multiline}
            textAlignVertical={multiline ? "top" : "center"}
            editable={editing}
            accessibilityLabel={label}
          />
          {suffix && (
            <Text style={twStyle("ml-2 text-sm text-gray-500")}>{suffix}</Text>
          )}
        </View>
        {errors[field] && (
          <Text style={twStyle("mt-1 text-xs text-red-500")}>{errors[field]}</Text>
        )}
      </View>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={service.title}
        showBack
        rightAction={
          editing ? (
            <View style={twStyle("flex-row")}>
              <TouchableOpacity
                style={[twStyle("rounded-full bg-gray-100 px-3 py-2"), { marginRight: 8 }]}
                onPress={handleCancelEdit}
                accessibilityLabel="Cancel editing"
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-medium text-gray-600")}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("rounded-full bg-indigo-600 px-3 py-2")}
                onPress={handleSave}
                disabled={saving}
                accessibilityLabel="Save service changes"
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-medium text-white")}>
                  {saving ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
              onPress={() => setEditing(true)}
              accessibilityLabel="Edit service"
              accessibilityRole="button"
            >
              <Ionicons name="pencil-outline" size={18} color="#111" />
            </TouchableOpacity>
          )
        }
      />

      <View style={twStyle(isTablet ? "flex-row" : "")}>
        <View style={[twStyle(isTablet ? "flex-1" : ""), isTablet && { marginRight: 24 }]}>
          {/* Service Image */}
          <TouchableOpacity
            style={twStyle("mb-4 h-48 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50")}
            onPress={handlePickServiceImage}
            disabled={!editing || uploadingImage}
            accessibilityLabel={
              service.image_url
                ? "Service image — tap to change"
                : "Tap to upload service image"
            }
            accessibilityRole="button"
          >
            {uploadingImage ? (
              <View style={twStyle("items-center")}>
                <ActivityIndicator size="large" color="#111" />
                <Text style={twStyle("mt-2 text-sm text-gray-500")}>
                  Uploading…
                </Text>
              </View>
            ) : service.image_url ? (
              <View style={twStyle("h-full w-full")}>
                <Image
                  source={{ uri: service.image_url }}
                  style={twStyle("h-full w-full rounded-2xl") as ImageStyle}
                  contentFit="cover"
                  transition={200}
                />
                {editing && (
                  <View style={twStyle("absolute bottom-2 right-2 rounded-full bg-black/60 p-2")}>
                    <Ionicons name="camera-outline" size={18} color="#fff" />
                  </View>
                )}
              </View>
            ) : (
              <>
                <Ionicons name="camera-outline" size={32} color="#9ca3af" />
                <Text style={twStyle("mt-2 text-sm text-gray-400")}>
                  {editing ? "Tap to upload image" : "No image"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Service Form */}
          <SectionHeader title="Service Details" />
          {!editing && typeof id === "string" && id ? (
            <TouchableOpacity
              onPress={() =>
                router.push(`/(app)/(tabs)/more/service-form?id=${encodeURIComponent(id)}` as never)
              }
              style={twStyle("mb-3 flex-row items-center rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3")}
              accessibilityRole="button"
              accessibilityLabel="Open full service editor"
            >
              <Ionicons name="create-outline" size={20} color="#4f46e5" style={{ marginRight: 10 }} />
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-sm font-semibold text-indigo-950")}>Full editor</Text>
                <Text style={twStyle("text-xs text-indigo-800 mt-0.5")}>
                  Category, staff, tax, online booking, aftercare, and more
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6366f1" />
            </TouchableOpacity>
          ) : null}
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
            {editing && form ? (
              <>
                <View style={twStyle("mb-4")}>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Category</Text>
                  <ChipCombobox
                    singleSelect
                    value={form.category_id || null}
                    onChange={(v) =>
                      setForm((prev) => (prev ? { ...prev, category_id: v ?? "" } : prev))
                    }
                    staticSuggestions={categories.map((c) => ({ value: c.id, label: c.name }))}
                    onCreateNew={handleCreateCategory}
                    placeholder="Select or add category"
                    accessibilityLabel="Service category"
                  />
                </View>
                <View style={twStyle("mb-4")}>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Team members</Text>
                  <ChipCombobox
                    value={form.team_member_ids}
                    onChange={(ids) => {
                      setForm((prev) => {
                        if (!prev) return prev;
                        if (ids.includes("__any__")) return { ...prev, team_member_ids: [] };
                        return { ...prev, team_member_ids: ids.filter((x) => x !== "__any__") };
                      });
                    }}
                    staticSuggestions={[
                      { value: "__any__", label: "Any team member" },
                      ...staff.map((m) => ({ value: m.id, label: m.name })),
                    ]}
                    placeholder="Any or select staff"
                    accessibilityLabel="Staff for this service"
                  />
                </View>
              </>
            ) : null}
            {renderFormField("Title", "title")}
            {renderFormField("Description", "description", "default", true)}
            {(service.pricing_options?.length ?? 0) > 1 && (
              <TouchableOpacity
                onPress={() => router.push(`/(app)/(tabs)/more/service-form?id=${service.id}` as never)}
                style={twStyle("mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3")}
                accessibilityRole="button"
                accessibilityLabel="This service has multiple pricing tiers. Open full editor."
              >
                <Text style={twStyle("text-sm font-medium text-amber-800")}>Multiple pricing tiers</Text>
                <Text style={twStyle("mt-0.5 text-xs text-amber-700")}>
                  Price & duration here reflect the primary tier only. Tap to open the full editor to manage all tiers.
                </Text>
              </TouchableOpacity>
            )}
            <View style={twStyle("flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                {renderFormField("Price", "price", "numeric", false, service.currency)}
              </View>
              <View style={twStyle("flex-1")}>
                {renderFormField(
                  "Duration",
                  "duration_minutes",
                  "numeric",
                  false,
                  "min"
                )}
              </View>
            </View>
            {errors.category_id ? (
              <Text style={twStyle("mb-2 text-xs text-red-500")}>{errors.category_id}</Text>
            ) : null}
          </View>

          {/* Location Types */}
          <SectionHeader title="Location Types" />
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5")}>
              <View style={twStyle("flex-row items-center")}>
                <Ionicons name="business-outline" size={18} color="#6b7280" />
                <Text style={twStyle("ml-3 text-sm text-gray-700")}>At Salon</Text>
              </View>
              <Switch
                value={form?.supports_at_salon ?? false}
                onValueChange={(v) => updateForm("supports_at_salon", v)}
                disabled={!editing}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                accessibilityLabel="Toggle at salon"
              />
            </View>
            <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5")}>
              <View style={twStyle("flex-row items-center")}>
                <Ionicons name="home-outline" size={18} color="#6b7280" />
                <Text style={twStyle("ml-3 text-sm text-gray-700")}>At Home</Text>
              </View>
              <Switch
                value={form?.supports_at_home ?? false}
                onValueChange={(v) => updateForm("supports_at_home", v)}
                disabled={!editing}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                accessibilityLabel="Toggle at home"
              />
            </View>
            {form?.supports_at_home && (
              <View style={twStyle("px-4 py-3")}>
                <View style={twStyle("flex-row")}>
                  <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                    <Text style={twStyle("mb-1 text-xs text-gray-500")}>
                      Home Price Adjustment
                    </Text>
                    <TextInput
                      style={twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                      value={form.at_home_price_adjustment}
                      onChangeText={(v) =>
                        updateForm("at_home_price_adjustment", v)
                      }
                      keyboardType="numeric"
                      editable={editing}
                      accessibilityLabel="Home visit price adjustment"
                    />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("mb-1 text-xs text-gray-500")}>
                      Radius (km)
                    </Text>
                    <TextInput
                      style={twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                      value={form.at_home_radius_km}
                      onChangeText={(v) => updateForm("at_home_radius_km", v)}
                      keyboardType="numeric"
                      editable={editing}
                      accessibilityLabel="Home visit radius in kilometers"
                    />
                  </View>
                </View>
              </View>
            )}
            {errors.location && (
              <Text style={twStyle("px-4 pb-2 text-xs text-red-500")}>
                {errors.location}
              </Text>
            )}
          </View>

          {/* Status Toggle */}
          <SectionHeader title="Status" />
          <View style={twStyle("flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-4")}>
            <View style={twStyle("flex-row items-center")}>
              <View
                style={twStyle(`mr-2 h-3 w-3 rounded-full ${
                  form?.is_active ? "bg-green-500" : "bg-gray-300"
                }`)}
              />
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {form?.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
            <Switch
              value={form?.is_active ?? false}
              onValueChange={(v) => updateForm("is_active", v)}
              disabled={!editing}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              accessibilityLabel="Toggle service active status"
            />
          </View>
        </View>

        <View style={twStyle(isTablet ? "flex-1" : "")}>
          {/* Category */}
          {service.provider_categories?.[0] && (
            <>
              <SectionHeader title="Category" />
              <View style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}>
                <View style={twStyle("self-start rounded-full bg-indigo-50 px-3 py-1")}>
                  <Text style={twStyle("text-sm font-medium text-indigo-700")}>
                    {service.provider_categories[0].name}
                  </Text>
                </View>
                {service.provider_categories[0].description && (
                  <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                    {service.provider_categories[0].description}
                  </Text>
                )}
              </View>
            </>
          )}

          {/*
            §Provider-audit 2026-04 (C1): web allows deleting a service from
            the catalogue page. Mobile previously only supported deleting
            add-ons/variants, forcing providers to the web admin to retire
            a service. Put destructive action at the bottom with a confirm.
          */}
          {!editing && (
            <View style={{ marginTop: 24, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={handleDeleteService}
                style={twStyle("rounded-xl border border-red-200 bg-red-50 py-3")}
                accessibilityRole="button"
                accessibilityLabel="Delete service"
                disabled={deletingService}
              >
                <Text style={twStyle("text-center text-sm font-semibold text-red-600")}>
                  {deletingService ? "Deleting…" : "Delete service"}
                </Text>
              </TouchableOpacity>
              <Text style={twStyle("mt-2 text-center text-xs text-gray-500")}>
                Permanently removes this service. Use the full editor to manage variants and add-ons.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
