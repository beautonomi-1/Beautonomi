import { useState, useCallback } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { StaticMapImage } from "@/components/ui/StaticMapImage";

/* ─── types ─── */
interface Location {
  id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_primary: boolean;
}

interface LocationForm {
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY_FORM: LocationForm = {
  name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "South Africa",
  phone: "",
  email: "",
  latitude: null,
  longitude: null,
};

/* ─── form field component ─── */
function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  required,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
  required?: boolean;
  error?: string;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-medium text-gray-700">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>
      <TextInput
        className={`rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${error ? "border-red-400" : "border-gray-200"}`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
      {error && (
        <Text className="mt-1 text-xs text-red-500">{error}</Text>
      )}
    </View>
  );
}

/* ─── screen ─── */
export default function LocationsSettingsScreen() {
  const { isTablet } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof LocationForm, string>>>({});

  const {
    data: locations,
    loading,
    refresh,
  } = useApi<Location[]>("/api/provider/locations");
  const { execute: createLocation, loading: creating } = useApiPost<
    LocationForm,
    Location
  >("/api/provider/locations");
  const { execute: updateLocation, loading: updating } =
    useApiMutation("patch");
  const { execute: deleteLocation, loading: deleting } =
    useApiMutation("delete");

  const isSaving = creating || updating;

  /* ─── handlers ─── */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  function openAddSheet() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setSheetVisible(true);
  }

  function openEditSheet(loc: Location) {
    setErrors({});
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      address_line1: loc.address_line1,
      address_line2: loc.address_line2 ?? "",
      city: loc.city,
      state: loc.state ?? "",
      postal_code: loc.postal_code ?? "",
      country: loc.country ?? "South Africa",
      phone: loc.phone ?? "",
      email: loc.email ?? "",
      latitude: (loc as unknown as Record<string, unknown>).latitude as number | null ?? null,
      longitude: (loc as unknown as Record<string, unknown>).longitude as number | null ?? null,
    });
    setSheetVisible(true);
  }

  function updateField(key: keyof LocationForm, value: string | number | null) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateForm(): boolean {
    const newErrors: Partial<Record<keyof LocationForm, string>> = {};
    if (!form.name.trim()) newErrors.name = "Location name is required";
    if (!form.address_line1.trim()) newErrors.address_line1 = "Address is required";
    if (!form.city.trim()) newErrors.city = "City is required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Invalid email address";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave() {
    if (!validateForm()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (editingId) {
      const { error } = await updateLocation(
        `/api/provider/locations/${editingId}`,
        form as unknown as Record<string, unknown>,
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Updated", "Location updated successfully.");
    } else {
      const { error } = await createLocation(form);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Created", "New location added successfully.");
    }
    setSheetVisible(false);
    refresh();
  }

  function handleDelete(loc: Location) {
    Alert.alert(
      "Delete Location",
      `Are you sure you want to delete "${loc.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await deleteLocation(
              `/api/provider/locations/${loc.id}`,
            );
            if (error) {
              Alert.alert("Error", error);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            }
          },
        },
      ],
    );
  }

  async function handleSetPrimary(loc: Location) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await updateLocation(
      `/api/provider/locations/${loc.id}`,
      { is_primary: true },
    );
    if (error) {
      Alert.alert("Error", error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }

  /* ─── render ─── */
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Locations"
        showBack
        subtitle={`${locations?.length ?? 0} location${(locations?.length ?? 0) !== 1 ? "s" : ""}`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-indigo-600"
            onPress={openAddSheet}
            accessibilityLabel="Add new location"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />

      {loading && !locations ? (
        <LoadingState />
      ) : !locations || locations.length === 0 ? (
        <EmptyState
          icon="location-outline"
          title="No locations"
          description="Add your first business location to get started."
          actionLabel="Add Location"
          onAction={openAddSheet}
        />
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(l: Location) => l.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: isTablet ? 12 : 8 }}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
          renderItem={({ item: loc }: { item: Location }) => (
            <View
              className={`rounded-xl border border-gray-100 bg-white p-4 ${isTablet ? "flex-1" : ""}`}
              accessibilityLabel={`Location ${loc.name}`}
            >
              {/* Header */}
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="text-base font-semibold text-gray-900">
                      {loc.name}
                    </Text>
                    {loc.is_primary && (
                      <View className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5">
                        <Text className="text-[10px] font-medium text-indigo-600">
                          Primary
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="mt-1 text-sm text-gray-500">
                    {loc.address_line1}
                  </Text>
                  <Text className="text-sm text-gray-500">
                    {loc.city}
                    {loc.state ? `, ${loc.state}` : ""}
                    {loc.postal_code ? ` ${loc.postal_code}` : ""}
                  </Text>
                  {loc.phone && (
                    <Text className="mt-1 text-xs text-gray-400">
                      {loc.phone}
                    </Text>
                  )}
                  {loc.email && (
                    <Text className="text-xs text-gray-400">{loc.email}</Text>
                  )}
                </View>
                <View
                  className={`h-2.5 w-2.5 rounded-full ${loc.is_active ? "bg-green-500" : "bg-gray-300"}`}
                  accessibilityLabel={loc.is_active ? "Active" : "Inactive"}
                />
              </View>

              {/* Actions */}
              <View className="mt-3 flex-row items-center gap-2 border-t border-gray-50 pt-3">
                <TouchableOpacity
                  className="flex-1 flex-row items-center justify-center rounded-lg bg-gray-100 py-2"
                  onPress={() => openEditSheet(loc)}
                  accessibilityLabel={`Edit ${loc.name}`}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={14} color="#6b7280" />
                  <Text className="ml-1 text-xs font-medium text-gray-600">
                    Edit
                  </Text>
                </TouchableOpacity>

                {!loc.is_primary && (
                  <TouchableOpacity
                    className="flex-1 flex-row items-center justify-center rounded-lg bg-indigo-50 py-2"
                    onPress={() => handleSetPrimary(loc)}
                    accessibilityLabel={`Set ${loc.name} as primary`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="star-outline" size={14} color="#6366f1" />
                    <Text className="ml-1 text-xs font-medium text-indigo-600">
                      Set Primary
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  className="flex-row items-center justify-center rounded-lg bg-red-50 px-3 py-2"
                  onPress={() => handleDelete(loc)}
                  accessibilityLabel={`Delete ${loc.name}`}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add / Edit Bottom Sheet */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editingId ? "Edit Location" : "Add Location"}
        snapHeight="full"
      >
        <FormField
          label="Location Name"
          value={form.name}
          onChangeText={(v) => { updateField("name", v); setErrors((prev) => ({ ...prev, name: undefined })); }}
          required
          error={errors.name}
        />
        <View className="mb-4">
          <AddressAutocomplete
            label="Search Address"
            value={form.address_line1}
            onSelect={(addr) => {
              updateField("address_line1", addr.address_line1);
              updateField("city", addr.city);
              updateField("state", addr.state);
              updateField("postal_code", addr.postal_code);
              updateField("country", addr.country);
              updateField("latitude", addr.latitude);
              updateField("longitude", addr.longitude);
              setErrors({});
            }}
          />
        </View>

        {form.latitude != null && form.longitude != null && (
          <View className="mb-4 overflow-hidden rounded-2xl">
            <StaticMapImage
              latitude={form.latitude}
              longitude={form.longitude}
              width={400}
              height={150}
              zoom={15}
            />
          </View>
        )}

        <FormField
          label="Address Line 1"
          value={form.address_line1}
          onChangeText={(v) => { updateField("address_line1", v); setErrors((prev) => ({ ...prev, address_line1: undefined })); }}
          required
          error={errors.address_line1}
        />
        <FormField
          label="Address Line 2"
          value={form.address_line2}
          onChangeText={(v) => updateField("address_line2", v)}
          placeholder="Suite, unit, floor (optional)"
        />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField
              label="City"
              value={form.city}
              onChangeText={(v) => { updateField("city", v); setErrors((prev) => ({ ...prev, city: undefined })); }}
              required
              error={errors.city}
            />
          </View>
          <View className="flex-1">
            <FormField
              label="State / Province"
              value={form.state}
              onChangeText={(v) => updateField("state", v)}
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField
              label="Postal Code"
              value={form.postal_code}
              onChangeText={(v) => updateField("postal_code", v)}
            />
          </View>
          <View className="flex-1">
            <FormField
              label="Country"
              value={form.country}
              onChangeText={(v) => updateField("country", v)}
            />
          </View>
        </View>

        <FormField
          label="Phone"
          value={form.phone}
          onChangeText={(v) => updateField("phone", v)}
          keyboardType="phone-pad"
        />
        <FormField
          label="Email"
          value={form.email}
          onChangeText={(v) => { updateField("email", v); setErrors((prev) => ({ ...prev, email: undefined })); }}
          keyboardType="email-address"
          error={errors.email}
        />

        <View className="mt-2">
          <ActionButton
            label={
              isSaving
                ? "Saving…"
                : editingId
                  ? "Update Location"
                  : "Add Location"
            }
            onPress={handleSave}
            loading={isSaving}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Floating add button */}
      {locations && locations.length > 0 && (
        <TouchableOpacity
          className="absolute bottom-8 right-6 h-14 w-14 items-center justify-center rounded-full bg-indigo-600 shadow-lg"
          onPress={openAddSheet}
          accessibilityLabel="Add location"
          accessibilityRole="button"
        >
          {deleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="add" size={28} color="#fff" />
          )}
        </TouchableOpacity>
      )}
    </ScreenContainer>
  );
}
