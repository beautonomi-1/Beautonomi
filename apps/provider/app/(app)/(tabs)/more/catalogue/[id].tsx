import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { formatCurrency, formatDuration } from "@/lib/format";
import { APP_URL } from "@/config/public-env";
import { supabase } from "@/lib/supabase/client";

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
  image_url?: string | null;
  created_at: string;
  updated_at: string;
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
  name: string;
  price: number;
  duration_minutes: number;
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
  };
}

interface AddOnFormState {
  name: string;
  price: string;
  duration_minutes: string;
}

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useRouter();
  const { isTablet } = useResponsive();

  const {
    data: service,
    loading,
    refresh,
  } = useApi<ServiceDetail>(`/api/provider/services/${id}`);
  const { data: addOns, refresh: refreshAddOns } = useApi<AddOn[]>(
    `/api/provider/services/${id}/addons`
  );
  const { data: variants } = useApi<
    ServiceVariant[]
  >(`/api/provider/services/${id}/variants`);

  const { execute: updateService, loading: saving } = useApiMutation("patch");
  const { execute: deleteItem } = useApiMutation("delete");
  const { execute: createAddOn, loading: creatingAddOn } = useApiPost<
    object,
    AddOn
  >(`/api/provider/services/${id}/addons`);
  const { execute: updateAddOn, loading: updatingAddOn } =
    useApiMutation("patch");

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

  async function handlePickServiceImage() {
    if (!editing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library to upload images."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "service-photo.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as any);
      formData.append("folder", "services");

      const uploadRes = await fetch(`${APP_URL}/api/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Upload failed");
      }

      const uploadJson = await uploadRes.json();
      const imageUrl = uploadJson.data?.url;

      if (!imageUrl) throw new Error("No URL returned from upload");

      await updateService(`/api/provider/services/${id}`, {
        image_url: imageUrl,
      });

      refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Upload Error", err.message ?? "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  useEffect(() => {
    if (service && !form) {
      setForm(initForm(service));
    }
    // Only sync when service loads; form intentionally omitted to avoid overwriting user edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

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
        <EmptyState title="Service not found" />
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
    if (!addOnForm.name.trim() || !addOnForm.price) return;
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
      <View className="mb-4">
        <Text className="mb-1 text-sm font-medium text-gray-700">
          {label}
        </Text>
        <View className="flex-row items-center">
          <TextInput
            className={`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${
              errors[field] ? "border-red-300" : "border-gray-200"
            } ${multiline ? "min-h-[80px]" : ""}`}
            value={isString ? (value as string) : ""}
            onChangeText={(v) => updateForm(field, v)}
            keyboardType={keyboardType}
            multiline={multiline}
            textAlignVertical={multiline ? "top" : "center"}
            editable={editing}
            accessibilityLabel={label}
          />
          {suffix && (
            <Text className="ml-2 text-sm text-gray-500">{suffix}</Text>
          )}
        </View>
        {errors[field] && (
          <Text className="mt-1 text-xs text-red-500">{errors[field]}</Text>
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
            <View className="flex-row gap-2">
              <TouchableOpacity
                className="rounded-full bg-gray-100 px-3 py-2"
                onPress={handleCancelEdit}
                accessibilityLabel="Cancel editing"
                accessibilityRole="button"
              >
                <Text className="text-sm font-medium text-gray-600">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full bg-indigo-600 px-3 py-2"
                onPress={handleSave}
                disabled={saving}
                accessibilityLabel="Save service changes"
                accessibilityRole="button"
              >
                <Text className="text-sm font-medium text-white">
                  {saving ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="h-10 w-10 items-center justify-center rounded-full bg-gray-100"
              onPress={() => setEditing(true)}
              accessibilityLabel="Edit service"
              accessibilityRole="button"
            >
              <Ionicons name="pencil-outline" size={18} color="#111" />
            </TouchableOpacity>
          )
        }
      />

      <View className={isTablet ? "flex-row gap-6" : ""}>
        <View className={isTablet ? "flex-1" : ""}>
          {/* Service Image */}
          <TouchableOpacity
            className="mb-4 h-48 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50"
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
              <View className="items-center">
                <ActivityIndicator size="large" color="#111" />
                <Text className="mt-2 text-sm text-gray-500">
                  Uploading…
                </Text>
              </View>
            ) : service.image_url ? (
              <View className="h-full w-full">
                <Image
                  source={{ uri: service.image_url }}
                  className="h-full w-full rounded-2xl"
                  contentFit="cover"
                  transition={200}
                />
                {editing && (
                  <View className="absolute bottom-2 right-2 rounded-full bg-black/60 p-2">
                    <Ionicons name="camera-outline" size={18} color="#fff" />
                  </View>
                )}
              </View>
            ) : (
              <>
                <Ionicons name="camera-outline" size={32} color="#9ca3af" />
                <Text className="mt-2 text-sm text-gray-400">
                  {editing ? "Tap to upload image" : "No image"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Service Form */}
          <SectionHeader title="Service Details" />
          <View className="rounded-2xl border border-gray-100 bg-white p-4">
            {renderFormField("Title", "title")}
            {renderFormField("Description", "description", "default", true)}
            <View className="flex-row gap-3">
              <View className="flex-1">
                {renderFormField("Price", "price", "numeric", false, service.currency)}
              </View>
              <View className="flex-1">
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
          <View className="rounded-2xl border border-gray-100 bg-white">
            <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
              <View className="flex-row items-center">
                <Ionicons name="business-outline" size={18} color="#6b7280" />
                <Text className="ml-3 text-sm text-gray-700">At Salon</Text>
              </View>
              <Switch
                value={form?.supports_at_salon ?? false}
                onValueChange={(v) => updateForm("supports_at_salon", v)}
                disabled={!editing}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                accessibilityLabel="Toggle at salon"
              />
            </View>
            <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
              <View className="flex-row items-center">
                <Ionicons name="home-outline" size={18} color="#6b7280" />
                <Text className="ml-3 text-sm text-gray-700">At Home</Text>
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
              <View className="px-4 py-3">
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-gray-500">
                      Home Price Adjustment
                    </Text>
                    <TextInput
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
                      value={form.at_home_price_adjustment}
                      onChangeText={(v) =>
                        updateForm("at_home_price_adjustment", v)
                      }
                      keyboardType="numeric"
                      editable={editing}
                      accessibilityLabel="Home visit price adjustment"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-gray-500">
                      Radius (km)
                    </Text>
                    <TextInput
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
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
              <Text className="px-4 pb-2 text-xs text-red-500">
                {errors.location}
              </Text>
            )}
          </View>

          {/* Status Toggle */}
          <SectionHeader title="Status" />
          <View className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-4">
            <View className="flex-row items-center">
              <View
                className={`mr-2 h-3 w-3 rounded-full ${
                  form?.is_active ? "bg-green-500" : "bg-gray-300"
                }`}
              />
              <Text className="text-sm font-medium text-gray-900">
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

        <View className={isTablet ? "flex-1" : ""}>
          {/* Add-ons Section */}
          <SectionHeader
            title="Add-ons"
            actionLabel="Add New"
            onAction={() => openAddOnForm()}
          />
          {!addOns || addOns.length === 0 ? (
            <View className="items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6">
              <Ionicons name="add-circle-outline" size={28} color="#d1d5db" />
              <Text className="mt-2 text-sm text-gray-400">
                No add-ons yet
              </Text>
              <TouchableOpacity
                className="mt-3 rounded-lg bg-indigo-50 px-4 py-2"
                onPress={() => openAddOnForm()}
                accessibilityLabel="Create first add-on"
                accessibilityRole="button"
              >
                <Text className="text-sm font-medium text-indigo-600">
                  Create Add-on
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="gap-2">
              {addOns.map((addOn) => (
                <View
                  key={addOn.id}
                  className="flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-4"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">
                      {addOn.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {formatCurrency(addOn.price, service.currency)} &middot;{" "}
                      {formatDuration(addOn.duration_minutes)}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => openAddOnForm(addOn)}
                      className="rounded-lg bg-gray-100 p-2"
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
                      className="rounded-lg bg-red-50 p-2"
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
          <SectionHeader title="Service Variants" />
          {!variants || variants.length === 0 ? (
            <View className="items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6">
              <Ionicons name="layers-outline" size={28} color="#d1d5db" />
              <Text className="mt-2 text-sm text-gray-400">
                No variants configured
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {variants.map((v) => (
                <View
                  key={v.id}
                  className="flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-4"
                >
                  <View>
                    <Text className="text-sm font-medium text-gray-900">
                      {v.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {formatDuration(v.duration_minutes)}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900">
                    {formatCurrency(v.price, service.currency)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Category */}
          {service.provider_categories?.[0] && (
            <>
              <SectionHeader title="Category" />
              <View className="rounded-xl border border-gray-100 bg-white p-4">
                <View className="self-start rounded-full bg-indigo-50 px-3 py-1">
                  <Text className="text-sm font-medium text-indigo-700">
                    {service.provider_categories[0].name}
                  </Text>
                </View>
                {service.provider_categories[0].description && (
                  <Text className="mt-2 text-xs text-gray-500">
                    {service.provider_categories[0].description}
                  </Text>
                )}
              </View>
            </>
          )}
        </View>
      </View>

      {/* Add-on Bottom Sheet */}
      <BottomSheet
        visible={showAddOnSheet}
        onClose={() => setShowAddOnSheet(false)}
        title={editingAddOn ? "Edit Add-on" : "New Add-on"}
      >
        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-gray-700">Name</Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            placeholder="e.g., Deep conditioning"
            placeholderTextColor="#9ca3af"
            value={addOnForm.name}
            onChangeText={(v) => setAddOnForm((p) => ({ ...p, name: v }))}
            accessibilityLabel="Add-on name"
          />
        </View>
        <View className="mb-4 flex-row gap-3">
          <View className="flex-1">
            <Text className="mb-1 text-sm font-medium text-gray-700">
              Price
            </Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
              placeholder="0"
              placeholderTextColor="#9ca3af"
              value={addOnForm.price}
              onChangeText={(v) => setAddOnForm((p) => ({ ...p, price: v }))}
              keyboardType="numeric"
              accessibilityLabel="Add-on price"
            />
          </View>
          <View className="flex-1">
            <Text className="mb-1 text-sm font-medium text-gray-700">
              Duration (min)
            </Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
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

      <View className="h-8" />
    </ScreenContainer>
  );
}
