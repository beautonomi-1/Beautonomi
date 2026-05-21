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
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatDuration } from "@/lib/format";
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
  buffer_minutes: number;
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

interface AddOn {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
}

interface ServiceVariant {
  id: string;
  /** Provider API returns title (same field used in booking flow) */
  title: string;
  variant_name?: string | null;
  price: number;
  duration_minutes: number;
  variant_sort_order?: number | null;
}

interface FormState {
  title: string;
  description: string;
  duration_minutes: string;
  buffer_minutes: string;
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
    buffer_minutes: String(service.buffer_minutes),
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

interface AddOnFormState {
  name: string;
  price: string;
  duration_minutes: string;
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
  const { data: addOns, refresh: refreshAddOns } = useApi<AddOn[]>(
    `/api/provider/services/${id}/addons`
  );
  const { data: variantResponse, refresh: refreshVariants } = useApi<{
    variants: ServiceVariant[];
    parent_service: { id: string; title: string; service_type: string };
    total_count: number;
  }>(`/api/provider/services/${id}/variants`);
  // The API returns { data: { variants, parent_service, total_count } }; extract the array.
  const variants = variantResponse?.variants ?? null;

  const { execute: updateService, loading: saving } = useApiMutation("patch");
  const { execute: deleteItem } = useApiMutation("delete");
  const { execute: createAddOn, loading: creatingAddOn } = useApiPost<
    object,
    AddOn
  >(`/api/provider/services/${id}/addons`);
  const { execute: updateAddOn, loading: updatingAddOn } =
    useApiMutation("patch");
  const { execute: createVariant, loading: creatingVariant } = useApiPost<
    object,
    ServiceVariant
  >(`/api/provider/services/${id}/variants`);
  const { execute: updateVariant, loading: updatingVariant } = useApiMutation("patch");
  const { execute: reorderVariant } = useApiMutation("patch");

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
  const [showAddOnSheet, setShowAddOnSheet] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null);
  const [addOnForm, setAddOnForm] = useState<AddOnFormState>({
    name: "",
    price: "",
    duration_minutes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState(false);

  // Variant form state
  const [showVariantSheet, setShowVariantSheet] = useState(false);
  const [variantForm, setVariantForm] = useState({ title: "", price: "", duration_minutes: "" });
  const [editingVariant, setEditingVariant] = useState<ServiceVariant | null>(null);

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
      buffer_minutes: Number(form.buffer_minutes) || 0,
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
      provider_category_id: form.category_id.trim() || null,
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

  function openAddOnForm(addOn?: AddOn) {
    if (addOn) {
      setEditingAddOn(addOn);
      setAddOnForm({
        name: addOn.name,
        price: String(addOn.price),
        duration_minutes: String(addOn.duration_minutes),
      });
    } else {
      setEditingAddOn(null);
      setAddOnForm({ name: "", price: "", duration_minutes: "" });
    }
    setShowAddOnSheet(true);
  }

  async function handleSaveAddOn() {
    if (!addOnForm.name.trim()) {
      Alert.alert("Required", "Please enter an add-on name.");
      return;
    }
    if (!addOnForm.price || Number(addOnForm.price) <= 0) {
      Alert.alert("Required", "Please enter a valid price.");
      return;
    }
    const payload = {
      name: addOnForm.name.trim(),
      price: Number(addOnForm.price),
      duration_minutes: Number(addOnForm.duration_minutes) || 0,
    };
    if (editingAddOn) {
      const { error } = await updateAddOn(
        `/api/provider/services/${id}/addons/${editingAddOn.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createAddOn(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    setShowAddOnSheet(false);
    await refreshAddOns();
  }

  async function handleDeleteAddOn(addOn: AddOn) {
    Alert.alert("Delete Add-on", `Remove "${addOn.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteItem(
            `/api/provider/services/${id}/addons/${addOn.id}`
          );
          if (error) Alert.alert("Error", error);
          else refreshAddOns();
        },
      },
    ]);
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

  function openVariantForm(v?: ServiceVariant) {
    if (v) {
      setEditingVariant(v);
      setVariantForm({
        title: v.title || v.variant_name || "",
        price: String(v.price ?? ""),
        duration_minutes: String(v.duration_minutes ?? ""),
      });
    } else {
      setEditingVariant(null);
      setVariantForm({ title: "", price: "", duration_minutes: "" });
    }
    setShowVariantSheet(true);
  }

  async function handleSaveVariant() {
    if (!variantForm.title.trim() || !variantForm.price || !variantForm.duration_minutes) {
      Alert.alert("Error", "Title, price, and duration are required");
      return;
    }
    const payload = {
      title: variantForm.title.trim(),
      variant_name: variantForm.title.trim(),
      price: Number(variantForm.price),
      duration_minutes: Number(variantForm.duration_minutes),
    };
    if (editingVariant) {
      const { error } = await updateVariant(
        `/api/provider/services/${id}/variants/${editingVariant.id}`,
        payload,
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createVariant(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    setShowVariantSheet(false);
    setEditingVariant(null);
    await refreshVariants();
    // Also refresh the service so has_variants flag is current
    await refresh();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // §Provider-audit 2026-04 (catalogue round 2): reorder a variant by
  // swapping its `variant_sort_order` with the neighbour. Matches the
  // server endpoint we just added at /api/provider/services/[id]/variants/[variantId]/reorder.
  async function handleReorderVariant(v: ServiceVariant, direction: "up" | "down") {
    if (!variants) return;
    const idx = variants.findIndex((x) => x.id === v.id);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === variants.length - 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await reorderVariant(
      `/api/provider/services/${id}/variants/${v.id}/reorder`,
      { direction },
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    await refreshVariants();
  }

  async function handleDeleteVariant(v: ServiceVariant) {
    Alert.alert("Delete Variant", `Remove "${v.title || v.variant_name || "this variant"}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteItem(
            `/api/provider/services/${id}/variants/${v.id}`
          );
          if (error) Alert.alert("Error", error);
          else {
            await refreshVariants();
            await refresh();
          }
        },
      },
    ]);
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
            {renderFormField(
              "Buffer Time",
              "buffer_minutes",
              "numeric",
              false,
              "min"
            )}
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
          {/* Add-ons Section */}
          <SectionHeader
            title="Add-ons"
            actionLabel="Add New"
            onAction={() => openAddOnForm()}
          />
          {!addOns || addOns.length === 0 ? (
            <View style={twStyle("items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6")}>
              <Ionicons name="add-circle-outline" size={28} color="#d1d5db" />
              <Text style={twStyle("mt-2 text-sm text-gray-400")}>
                No add-ons yet
              </Text>
              <TouchableOpacity
                style={twStyle("mt-3 rounded-lg bg-indigo-50 px-4 py-2")}
                onPress={() => openAddOnForm()}
                accessibilityLabel="Create first add-on"
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-medium text-indigo-600")}>
                  Create Add-on
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {addOns.map((addOn, addOnIdx) => (
                <View
                  key={addOn.id}
                  style={[twStyle("flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-4"), addOnIdx > 0 && { marginTop: 8 }]}
                >
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {addOn.name}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      {formatCurrency(addOn.price, service.currency)} &middot;{" "}
                      {formatDuration(addOn.duration_minutes)}
                    </Text>
                  </View>
                  <View style={twStyle("flex-row")}>
                    <TouchableOpacity
                      onPress={() => openAddOnForm(addOn)}
                      style={[twStyle("rounded-lg bg-gray-100 p-2"), { marginRight: 8 }]}
                      accessibilityLabel={`Edit add-on ${addOn.name}`}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name="pencil-outline"
                        size={16}
                        color="#6b7280"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteAddOn(addOn)}
                      style={twStyle("rounded-lg bg-red-50 p-2")}
                      accessibilityLabel={`Delete add-on ${addOn.name}`}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Variants Section */}
          <SectionHeader
            title="Service Variants"
            actionLabel="Add New"
            onAction={() => openVariantForm()}
          />
          <Text style={twStyle("mb-3 text-xs text-gray-500 leading-relaxed")}>
            Variants let customers choose from different options (e.g. short / long hair, 30 min / 60 min). Each variant gets its own price and duration and appears as a selectable option in the booking flow.
          </Text>
          {!variants || variants.length === 0 ? (
            <View style={twStyle("items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6")}>
              <Ionicons name="layers-outline" size={28} color="#d1d5db" />
              <Text style={twStyle("mt-2 text-sm text-gray-400")}>
                No variants yet
              </Text>
              <TouchableOpacity
                style={twStyle("mt-3 rounded-lg bg-indigo-50 px-4 py-2")}
                onPress={() => openVariantForm()}
                accessibilityLabel="Create first variant"
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-medium text-indigo-600")}>
                  Create Variant
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {variants.map((v, vIdx) => (
                <View
                  key={v.id}
                  style={[twStyle("flex-row items-center rounded-xl border border-gray-100 bg-white p-3"), vIdx > 0 && { marginTop: 8 }]}
                >
                  {/* §Provider-audit 2026-04 (catalogue round 2): variant reorder buttons — the
                      variants already sort server-side by `variant_sort_order`, now providers
                      can control that order from mobile without going to web admin. */}
                  <View style={twStyle("mr-2 items-center")}>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => handleReorderVariant(v, "up")}
                      disabled={vIdx === 0}
                      accessibilityLabel={`Move ${v.title || v.variant_name} up`}
                      style={{ opacity: vIdx === 0 ? 0.25 : 1 }}
                    >
                      <Ionicons name="chevron-up" size={18} color="#6b7280" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => handleReorderVariant(v, "down")}
                      disabled={vIdx === variants.length - 1}
                      accessibilityLabel={`Move ${v.title || v.variant_name} down`}
                      style={{ opacity: vIdx === variants.length - 1 ? 0.25 : 1 }}
                    >
                      <Ionicons name="chevron-down" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={twStyle("flex-1")}
                    onPress={() => openVariantForm(v)}
                    accessibilityLabel={`Edit variant ${v.title || v.variant_name}`}
                    accessibilityRole="button"
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {v.title || v.variant_name || "—"}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      {formatDuration(v.duration_minutes)} · {formatCurrency(v.price, service.currency)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openVariantForm(v)}
                    style={[twStyle("rounded-lg bg-gray-100 p-2"), { marginRight: 8 }]}
                    accessibilityLabel={`Edit variant ${v.title || v.variant_name}`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="pencil-outline" size={16} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteVariant(v)}
                    style={twStyle("rounded-lg bg-red-50 p-2")}
                    accessibilityLabel={`Delete variant ${v.title || v.variant_name}`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

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
                Permanently removes this service and its add-ons. Existing bookings are not affected.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Add-on Bottom Sheet */}
      <BottomSheet
        visible={showAddOnSheet}
        onClose={() => setShowAddOnSheet(false)}
        title={editingAddOn ? "Edit Add-on" : "New Add-on"}
      >
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Name</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            placeholder="e.g., Deep conditioning"
            placeholderTextColor="#9ca3af"
            value={addOnForm.name}
            onChangeText={(v) => setAddOnForm((p) => ({ ...p, name: v }))}
            accessibilityLabel="Add-on name"
          />
        </View>
        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              Price
            </Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              value={addOnForm.price}
              onChangeText={(v) => setAddOnForm((p) => ({ ...p, price: v }))}
              keyboardType="numeric"
              accessibilityLabel="Add-on price"
            />
          </View>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              Duration (min)
            </Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              value={addOnForm.duration_minutes}
              onChangeText={(v) =>
                setAddOnForm((p) => ({ ...p, duration_minutes: v }))
              }
              keyboardType="numeric"
              accessibilityLabel="Add-on duration in minutes"
            />
          </View>
        </View>
        <ActionButton
          label={editingAddOn ? "Update Add-on" : "Create Add-on"}
          variant="secondary"
          onPress={handleSaveAddOn}
          loading={creatingAddOn || updatingAddOn}
          fullWidth
          disabled={!addOnForm.name.trim() || !addOnForm.price}
        />
      </BottomSheet>

      {/* Variant Bottom Sheet */}
      <BottomSheet
        visible={showVariantSheet}
        onClose={() => {
          setShowVariantSheet(false);
          setEditingVariant(null);
        }}
        title={editingVariant ? "Edit Variant" : "New Variant"}
      >
        <Text style={twStyle("mb-3 text-xs text-gray-500 leading-relaxed")}>
          Add a booking option with its own price and duration (e.g. &quot;Short Hair - 30 min&quot;).
        </Text>
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Title</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            placeholder="e.g., Short Hair, 30 min session"
            placeholderTextColor="#9ca3af"
            value={variantForm.title}
            onChangeText={(v) => setVariantForm((p) => ({ ...p, title: v }))}
            accessibilityLabel="Variant title"
          />
        </View>
        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              Price ({service?.currency})
            </Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              value={variantForm.price}
              onChangeText={(v) => setVariantForm((p) => ({ ...p, price: v }))}
              keyboardType="numeric"
              accessibilityLabel="Variant price"
            />
          </View>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              Duration (min)
            </Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
              placeholder="60"
              placeholderTextColor="#9ca3af"
              value={variantForm.duration_minutes}
              onChangeText={(v) => setVariantForm((p) => ({ ...p, duration_minutes: v }))}
              keyboardType="numeric"
              accessibilityLabel="Variant duration in minutes"
            />
          </View>
        </View>
        <ActionButton
          label={editingVariant ? "Update Variant" : "Create Variant"}
          variant="secondary"
          onPress={handleSaveVariant}
          loading={creatingVariant || updatingVariant}
          fullWidth
          disabled={!variantForm.title.trim() || !variantForm.price || !variantForm.duration_minutes}
        />
      </BottomSheet>

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
