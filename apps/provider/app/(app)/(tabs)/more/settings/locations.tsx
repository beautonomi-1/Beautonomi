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
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { getCachedConfigBundle } from "@/lib/config-bundle";

function tenantCountryFallback(): string {
  return getCachedConfigBundle()?.meta?.tenant_region?.name?.trim() || "";
}

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
  country: "",
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
    <View style={twStyle("mb-4")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
        {label}
        {required && <Text style={twStyle("text-red-500")}> *</Text>}
      </Text>
      <TextInput
        style={twStyle(`rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${error ? "border-red-400" : "border-gray-200"}`)}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
      {error && (
        <Text style={twStyle("mt-1 text-xs text-red-500")}>{error}</Text>
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
    error: loadError,
    refresh,
  } = useApi<Location[]>("/api/provider/locations?include_inactive=true");
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
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  function openAddSheet() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, country: tenantCountryFallback() });
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
      country: loc.country ?? tenantCountryFallback(),
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
    if (!form.country.trim()) newErrors.country = "Country is required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Invalid email address";
    }
    if (form.phone?.trim()) {
      const phoneErr = validateE164Phone(form.phone.trim());
      if (phoneErr) newErrors.phone = phoneErr;
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
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-indigo-600")}
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
      ) : loadError && !locations ? (
        <ErrorState message="Could not load locations. Pull down to retry." onRetry={refresh} />
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
          {...verticalFlatListPerf}
          data={locations}
          keyExtractor={(l: Location) => l.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={!isTablet ? () => <View style={{ height: 8 }} /> : undefined}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { marginBottom: 12 } : undefined}
          renderItem={({ item: loc, index }: { item: Location; index: number }) => (
            <View
              style={[twStyle(`rounded-xl border border-gray-100 bg-white p-4 ${isTablet ? "flex-1" : ""}`), isTablet && index % 2 === 0 && { marginRight: 12 }]}
              accessibilityLabel={`Location ${loc.name}`}
            >
              {/* Header */}
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <View style={twStyle("flex-row items-center")}>
                    <Text style={twStyle("text-base font-semibold text-gray-900")}>
                      {loc.name}
                    </Text>
                    {loc.is_primary && (
                      <View style={twStyle("ml-2 rounded-full bg-indigo-50 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-medium text-indigo-600")}>
                          Primary
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={twStyle("mt-1 text-sm text-gray-500")}>
                    {loc.address_line1}
                  </Text>
                  <Text style={twStyle("text-sm text-gray-500")}>
                    {loc.city}
                    {loc.state ? `, ${loc.state}` : ""}
                    {loc.postal_code ? ` ${loc.postal_code}` : ""}
                  </Text>
                  {loc.phone && (
                    <Text style={twStyle("mt-1 text-xs text-gray-400")}>
                      {loc.phone}
                    </Text>
                  )}
                  {loc.email && (
                    <Text style={twStyle("text-xs text-gray-400")}>{loc.email}</Text>
                  )}
                </View>
                <View
                  style={twStyle(`h-2.5 w-2.5 rounded-full ${loc.is_active ? "bg-green-500" : "bg-gray-300"}`)}
                  accessibilityLabel={loc.is_active ? "Active" : "Inactive"}
                />
              </View>

              {/* Actions */}
              <View style={twStyle("mt-3 flex-row items-center border-t border-gray-50 pt-3")}>
                <TouchableOpacity
                  style={[twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-gray-100 py-2"), { marginRight: 8 }]}
                  onPress={() => openEditSheet(loc)}
                  accessibilityLabel={`Edit ${loc.name}`}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={14} color="#6b7280" />
                  <Text style={twStyle("ml-1 text-xs font-medium text-gray-600")}>
                    Edit
                  </Text>
                </TouchableOpacity>

                {!loc.is_primary && (
                  <TouchableOpacity
                    style={[twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-indigo-50 py-2"), { marginRight: 8 }]}
                    onPress={() => handleSetPrimary(loc)}
                    accessibilityLabel={`Set ${loc.name} as primary`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="star-outline" size={14} color="#6366f1" />
                    <Text style={twStyle("ml-1 text-xs font-medium text-indigo-600")}>
                      Set Primary
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={twStyle("flex-row items-center justify-center rounded-lg bg-red-50 px-3 py-2")}
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
        <View style={twStyle("mb-4")}>
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
          <View style={twStyle("mb-4 overflow-hidden rounded-2xl")}>
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

        <View style={twStyle("flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <FormField
              label="City"
              value={form.city}
              onChangeText={(v) => { updateField("city", v); setErrors((prev) => ({ ...prev, city: undefined })); }}
              required
              error={errors.city}
            />
          </View>
          <View style={twStyle("flex-1")}>
            <FormField
              label="State / Province"
              value={form.state}
              onChangeText={(v) => updateField("state", v)}
            />
          </View>
        </View>

        <View style={twStyle("flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <FormField
              label="Postal Code"
              value={form.postal_code}
              onChangeText={(v) => updateField("postal_code", v)}
            />
          </View>
          <View style={twStyle("flex-1")}>
            <FormField
              label="Country"
              value={form.country}
              onChangeText={(v) => {
                updateField("country", v);
                setErrors((prev) => ({ ...prev, country: undefined }));
              }}
              required
              error={errors.country}
            />
          </View>
        </View>

        <E164PhoneField
          label="Phone (optional)"
          valueE164={form.phone}
          onChangeE164={(v) => {
            updateField("phone", v);
            setErrors((prev) => ({ ...prev, phone: undefined }));
          }}
          showHint
        />
        {errors.phone ? (
          <Text style={twStyle("text-sm text-red-600 mt-1")}>{errors.phone}</Text>
        ) : null}
        <FormField
          label="Email"
          value={form.email}
          onChangeText={(v) => { updateField("email", v); setErrors((prev) => ({ ...prev, email: undefined })); }}
          keyboardType="email-address"
          error={errors.email}
        />

        <View style={twStyle("mt-2")}>
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
          style={twStyle("absolute bottom-8 right-6 h-14 w-14 items-center justify-center rounded-full bg-indigo-600 shadow-lg")}
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
