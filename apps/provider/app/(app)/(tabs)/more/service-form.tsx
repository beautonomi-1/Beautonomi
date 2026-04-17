import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";

interface ServiceCategory {
  id: string;
  name: string;
  color?: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  email?: string;
}

interface Service {
  id: string;
  title?: string;
  name?: string;
  provider_category_id?: string | null;
  service_type?: string;
  duration_minutes?: number;
  price?: number;
  price_type?: string;
  pricing_name?: string | null;
  pricing_options?: { duration: number; price_type: string; price: number; pricing_name?: string }[];
  description?: string | null;
  aftercare_description?: string | null;
  service_available_for?: string;
  online_booking_enabled?: boolean;
  supports_at_salon?: boolean;
  supports_at_home?: boolean;
  at_home_radius_km?: number | null;
  at_home_price_adjustment?: number;
  team_member_ids?: string[];
  team_member_commission_enabled?: boolean;
  tax_rate?: number;
  is_active?: boolean;
  // §Provider-launch (audit 2026-04): web/ServiceCreateEditDialog already
  // persists these "Extra Time" fields so services with cleanup or
  // transition buffers block the calendar correctly. Adding them on
  // mobile keeps the two clients at feature parity.
  extra_time_enabled?: boolean;
  extra_time_duration?: number;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      <TextInput
        style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? "top" : "center"}
        accessibilityLabel={label}
      />
    </View>
  );
}

const defaultForm = {
  name: "",
  categoryId: "",
  serviceType: "basic",
  durationMinutes: "60",
  price: "",
  pricingName: "",
  description: "",
  aftercareDescription: "",
  availableFor: "everyone",
  onlineBookable: true,
  supportsAtSalon: true,
  supportsAtHome: false,
  atHomeRadiusKm: "",
  atHomePriceAdjustment: "0",
  taxRate: "0",
  teamMemberIds: [] as string[],
  teamMemberCommissionEnabled: false,
  isActive: true,
  extraTimeEnabled: false,
  extraTimeDuration: "15",
};

export default function ServiceFormScreen() {
  const router = useRouter();
  const { id: serviceId } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!serviceId;

  const { data: categoriesRes, refresh: refreshCategories } = useApi<{ data?: { own_categories?: ServiceCategory[] }; own_categories?: ServiceCategory[] }>(
    "/api/provider/categories"
  );
  const { data: service, loading: loadingService, error: serviceError } = useApi<Service>(
    serviceId ? `/api/provider/services/${serviceId}` : "",
    { enabled: !!serviceId }
  );
  const { data: staffData } = useApi<StaffMember[] | { data?: StaffMember[] }>("/api/provider/staff");
  const { data: refData } = useApi<Record<string, { value: string; label: string }[]> | unknown>(
    "/api/provider/reference-data?type=service_type,availability,tax_rate"
  );

  const { execute: createService, loading: creating } = useApiMutation("post");
  const { execute: updateService, loading: updating } = useApiMutation("patch");
  const { execute: postMutation } = useApiMutation("post");

  const categories =
    categoriesRes?.own_categories ??
    (categoriesRes as any)?.data?.own_categories ??
    [];
  const staff = Array.isArray(staffData) ? staffData : (staffData as any)?.data ?? [];
  const refObj = refData && typeof refData === "object" && !Array.isArray(refData)
    ? (refData as Record<string, { value: string; label: string }[]>)
    : {};
  const serviceTypeOptions = refObj.service_type?.length ? refObj.service_type : [{ value: "basic", label: "Basic" }, { value: "addon", label: "Add-on" }, { value: "package", label: "Package" }];
  const availabilityOptions = refObj.availability?.length ? refObj.availability : [{ value: "everyone", label: "Everyone" }, { value: "women", label: "Women" }, { value: "men", label: "Men" }];
  const taxRateOptions = refObj.tax_rate?.length ? refObj.tax_rate : [{ value: "0", label: "No tax" }, { value: "15", label: "15% VAT" }];

  const [form, setForm] = useState(defaultForm);
  const [serviceTypeSheetOpen, setServiceTypeSheetOpen] = useState(false);
  const [availabilitySheetOpen, setAvailabilitySheetOpen] = useState(false);
  const [taxSheetOpen, setTaxSheetOpen] = useState(false);

  useEffect(() => {
    if (service) {
      setForm({
        name: service.title || service.name || "",
        categoryId: service.provider_category_id ?? "",
        serviceType: service.service_type ?? "basic",
        durationMinutes: String(service.duration_minutes ?? 60),
        price: String(service.price ?? ""),
        pricingName: service.pricing_name ?? "",
        description: service.description ?? "",
        aftercareDescription: service.aftercare_description ?? "",
        availableFor: service.service_available_for ?? "everyone",
        onlineBookable: service.online_booking_enabled !== false,
        supportsAtSalon: service.supports_at_salon !== false,
        supportsAtHome: service.supports_at_home ?? false,
        atHomeRadiusKm: service.at_home_radius_km != null ? String(service.at_home_radius_km) : "",
        atHomePriceAdjustment: String(service.at_home_price_adjustment ?? 0),
        taxRate: String(service.tax_rate ?? 0),
        teamMemberIds: service.team_member_ids ?? [],
        teamMemberCommissionEnabled: service.team_member_commission_enabled ?? false,
        isActive: service.is_active !== false,
        extraTimeEnabled: service.extra_time_enabled ?? false,
        extraTimeDuration: String(service.extra_time_duration ?? 15),
      });
    } else if (!serviceId) {
      setForm({ ...defaultForm });
    }
  }, [service, serviceId]);

  const handleCreateCategory = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const res = (await postMutation("/api/provider/categories", {
        name: trimmed,
      })) as { data?: { id: string }; error?: string };
      if (res.error) {
        Alert.alert("Error", res.error);
        return null;
      }
      await refreshCategories();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return res.data?.id
        ? { value: res.data.id, label: trimmed }
        : null;
    },
    [postMutation, refreshCategories]
  );

  const handleSave = useCallback(async () => {
    const name = form.name.trim();
    const price = parseFloat(form.price);
    const duration = parseInt(form.durationMinutes, 10);
    if (!name) {
      Alert.alert("Validation", "Service name is required.");
      return;
    }
    if (!form.categoryId) {
      Alert.alert("Validation", "Please select a category.");
      return;
    }
    if (isNaN(price) || price < 0) {
      Alert.alert("Validation", "Price must be a valid number.");
      return;
    }
    if (isNaN(duration) || duration <= 0) {
      Alert.alert("Validation", "Duration must be a positive number (minutes).");
      return;
    }

    const payload = {
      name,
      title: name,
      provider_category_id: form.categoryId,
      service_type: form.serviceType,
      duration_minutes: duration,
      price,
      pricing_name: form.pricingName || null,
      price_type: "fixed",
      description: form.description || null,
      aftercare_description: form.aftercareDescription || null,
      service_available_for: form.availableFor,
      online_booking_enabled: form.onlineBookable,
      supports_at_salon: form.supportsAtSalon,
      supports_at_home: form.supportsAtHome,
      at_home_radius_km: form.supportsAtHome && form.atHomeRadiusKm ? parseFloat(form.atHomeRadiusKm) : null,
      at_home_price_adjustment: form.supportsAtHome ? parseFloat(form.atHomePriceAdjustment) || 0 : 0,
      tax_rate: parseFloat(form.taxRate) || 0,
      team_member_ids: form.teamMemberIds,
      team_member_commission_enabled: form.teamMemberCommissionEnabled,
      is_active: form.isActive,
      extra_time_enabled: form.extraTimeEnabled,
      extra_time_duration: form.extraTimeEnabled ? parseInt(form.extraTimeDuration, 10) || 0 : 0,
    };

    if (isEdit && serviceId) {
      const { error } = await updateService(`/api/provider/services/${serviceId}`, payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      const { error } = await createService("/api/provider/services", payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    }
  }, [form, isEdit, serviceId, createService, updateService, router]);

  const isSaving = creating || updating;

  if (serviceId && loadingService && !service) {
    return (
      <ScreenContainer>
        <ScreenHeader title={isEdit ? "Edit Service" : "Add Service"} onBack={() => router.back()} />
        <LoadingState message="Loading service..." />
      </ScreenContainer>
    );
  }

  if (serviceId && serviceError && !service) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Edit Service" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center p-6")}>
          <Text style={twStyle("text-center text-gray-600")}>Service not found.</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={twStyle("mt-4")}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-indigo-600")}>Go back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={isEdit ? "Edit Service" : "Add Service"}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={twStyle("min-h-[40px] flex-row items-center justify-center rounded-full bg-indigo-600 px-4")}
            accessibilityLabel="Save service"
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-medium text-white")}>Save</Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={twStyle("flex-1")}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={twStyle("px-1 pt-2")}>
            <FormField
              label="Service name *"
              value={form.name}
              onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
              placeholder="e.g. Signature Haircut, Full Body Massage"
            />

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Category *</Text>
              <ChipCombobox
                singleSelect
                value={form.categoryId || null}
                onChange={(v) => setForm((p) => ({ ...p, categoryId: v ?? "" }))}
                staticSuggestions={categories.map((c: ServiceCategory) => ({ value: c.id, label: c.name }))}
                onCreateNew={handleCreateCategory}
                placeholder="Select or add category"
                accessibilityLabel="Category"
                accessibilityHint="Select a category or type to add a new one"
              />
            </View>

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Service type</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setServiceTypeSheetOpen(true)}
                accessibilityLabel={`Service type, ${serviceTypeOptions.find((o) => o.value === form.serviceType)?.label ?? form.serviceType}`}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {serviceTypeOptions.find((o) => o.value === form.serviceType)?.label ?? form.serviceType}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={twStyle("mb-3 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <FormField
                  label="Duration (min) *"
                  value={form.durationMinutes}
                  onChangeText={(t) => setForm((p) => ({ ...p, durationMinutes: t }))}
                  placeholder="60"
                  keyboardType="numeric"
                />
              </View>
              <View style={twStyle("flex-1")}>
                <FormField
                  label="Price *"
                  value={form.price}
                  onChangeText={(t) => setForm((p) => ({ ...p, price: t }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <FormField
              label="Pricing name (optional)"
              value={form.pricingName}
              onChangeText={(t) => setForm((p) => ({ ...p, pricingName: t }))}
              placeholder="e.g. Standard, Express"
            />

            <FormField
              label="Description (optional)"
              value={form.description}
              onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
              placeholder="What clients can expect"
              multiline
            />
            <FormField
              label="Aftercare instructions (optional)"
              value={form.aftercareDescription}
              onChangeText={(t) => setForm((p) => ({ ...p, aftercareDescription: t }))}
              placeholder="e.g. Avoid washing for 24 hours"
              multiline
            />

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Available for</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setAvailabilitySheetOpen(true)}
                accessibilityLabel={`Available for, ${availabilityOptions.find((o) => o.value === form.availableFor)?.label ?? form.availableFor}`}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {availabilityOptions.find((o) => o.value === form.availableFor)?.label ?? form.availableFor}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Tax rate</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setTaxSheetOpen(true)}
                accessibilityLabel={`Tax rate, ${taxRateOptions.find((o) => o.value === form.taxRate)?.label ?? `${form.taxRate}%`}`}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {taxRateOptions.find((o) => o.value === form.taxRate)?.label ?? `${form.taxRate}%`}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Team members</Text>
              <ChipCombobox
                value={form.teamMemberIds}
                onChange={(ids) => {
                  if (ids.includes("__any__")) {
                    setForm((p) => ({ ...p, teamMemberIds: [] }));
                  } else {
                    setForm((p) => ({ ...p, teamMemberIds: ids.filter((id) => id !== "__any__") }));
                  }
                }}
                staticSuggestions={[
                  { value: "__any__", label: "Any team member" },
                  ...staff.map((m: StaffMember) => ({ value: m.id, label: m.name })),
                ]}
                placeholder="Any or select staff"
                accessibilityLabel="Team members"
                accessibilityHint="Add or remove team members who can perform this service"
              />
            </View>

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Online bookable</Text>
              <Switch
                value={form.onlineBookable}
                onValueChange={(v) => setForm((p) => ({ ...p, onlineBookable: v }))}
              />
            </View>

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Available at salon</Text>
              <Switch
                value={form.supportsAtSalon}
                onValueChange={(v) => setForm((p) => ({ ...p, supportsAtSalon: v }))}
              />
            </View>
            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Available at home</Text>
              <Switch
                value={form.supportsAtHome}
                onValueChange={(v) => setForm((p) => ({ ...p, supportsAtHome: v }))}
              />
            </View>
            {form.supportsAtHome && (
              <>
                <FormField
                  label="At-home radius (km)"
                  value={form.atHomeRadiusKm}
                  onChangeText={(t) => setForm((p) => ({ ...p, atHomeRadiusKm: t }))}
                  placeholder="10"
                  keyboardType="decimal-pad"
                />
                <FormField
                  label={`At-home price adjustment (${getTenantDefaultCurrency()})`}
                  value={form.atHomePriceAdjustment}
                  onChangeText={(t) => setForm((p) => ({ ...p, atHomePriceAdjustment: t }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </>
            )}

            {/*
              §Provider-launch (audit 2026-04): extra (buffer) time field
              brings mobile to parity with web's ServiceCreateEditDialog
              "Extra Time" toggle + duration selector.  Without this the
              calendar booked back-to-back slots with no cleanup buffer.
            */}
            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Extra (buffer) time</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                  Block time after the service for cleanup or transition.
                </Text>
              </View>
              <Switch
                value={form.extraTimeEnabled}
                onValueChange={(v) => setForm((p) => ({ ...p, extraTimeEnabled: v }))}
              />
            </View>
            {form.extraTimeEnabled ? (
              <FormField
                label="Extra time (minutes)"
                value={form.extraTimeDuration}
                onChangeText={(t) => setForm((p) => ({ ...p, extraTimeDuration: t.replace(/[^0-9]/g, "") }))}
                placeholder="15"
                keyboardType="numeric"
              />
            ) : null}

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Team commission</Text>
              <Switch
                value={form.teamMemberCommissionEnabled}
                onValueChange={(v) => setForm((p) => ({ ...p, teamMemberCommissionEnabled: v }))}
              />
            </View>
            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
              <Switch
                value={form.isActive}
                onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={serviceTypeSheetOpen}
        onClose={() => setServiceTypeSheetOpen(false)}
        title="Service type"
      >
        <ScrollView style={twStyle("max-h-80")}>
          {serviceTypeOptions.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, serviceType: o.value }));
                setServiceTypeSheetOpen(false);
              }}
              accessibilityLabel={o.label}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={availabilitySheetOpen}
        onClose={() => setAvailabilitySheetOpen(false)}
        title="Available for"
      >
        <ScrollView style={twStyle("max-h-80")}>
          {availabilityOptions.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, availableFor: o.value }));
                setAvailabilitySheetOpen(false);
              }}
              accessibilityLabel={o.label}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={taxSheetOpen}
        onClose={() => setTaxSheetOpen(false)}
        title="Tax rate"
      >
        <ScrollView style={twStyle("max-h-80")}>
          {taxRateOptions.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, taxRate: o.value }));
                setTaxSheetOpen(false);
              }}
              accessibilityLabel={o.label}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

    </ScreenContainer>
  );
}
