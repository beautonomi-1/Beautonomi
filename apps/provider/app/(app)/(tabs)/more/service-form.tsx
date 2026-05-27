import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { PricingOptionsEditor } from "@/features/catalogue/PricingOptionsEditor";
import { AdvancedPricingRulesEditor } from "@/features/catalogue/AdvancedPricingRulesEditor";
import {
  ApplicableServicesPicker,
  IncludedServicesPicker,
  ServiceIdsChips,
} from "@/features/catalogue/ServiceIdsPicker";
import { ParentServicePicker } from "@/features/catalogue/ParentServicePicker";
import { ResourceRequirementsEditor } from "@/features/catalogue/ResourceRequirementsEditor";
import { buildServicePayload, buildResourcesPayload } from "@/features/catalogue/buildServicePayload";
import { validateAdvancedPricingRules, validateServiceForm } from "@/features/catalogue/validateServiceForm";
import type {
  AdvancedPricingRule,
  CatalogueServiceItem,
  OfferingResourceEntry,
  PricingOption,
  RefDataOption,
} from "@/features/catalogue/types";
import { DEFAULT_PRICING_OPTION, pricingOptionsFromService } from "@/features/catalogue/types";

interface ServiceCategory {
  id: string;
  name: string;
  color?: string | null;
}

interface StaffMember {
  id: string;
  name: string;
}

interface Service extends CatalogueServiceItem {
  aftercare_description?: string | null;
  service_available_for?: string;
  online_booking_enabled?: boolean;
  team_member_ids?: string[];
  team_member_commission_enabled?: boolean;
  tax_rate?: number;
  extra_time_enabled?: boolean;
  extra_time_duration?: number;
  reminder_to_rebook_enabled?: boolean;
  reminder_to_rebook_weeks?: number;
  service_cost_percentage?: number;
  advanced_pricing_rules?: AdvancedPricingRule[];
  included_services?: string[];
  applicable_service_ids?: string[] | null;
  addon_category?: string | null;
  is_recommended?: boolean;
  parent_service_id?: string | null;
  variant_name?: string | null;
  variant_sort_order?: number;
  price_type?: string;
  pricing_name?: string | null;
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
      />
    </View>
  );
}

const defaultForm = {
  name: "",
  categoryId: "",
  serviceType: "basic",
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
  reminderToRebookEnabled: false,
  reminderToRebookWeeks: "4",
  serviceCostPercentage: "0",
  includedServices: [] as string[],
  applicableServiceIds: [] as string[],
  addonCategory: "general",
  isRecommended: false,
  parentServiceId: "",
  variantName: "",
  variantSortOrder: 0,
};

export default function ServiceFormScreen() {
  const router = useRouter();
  const { id: serviceId } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!serviceId;

  const { data: categoriesRes, refresh: refreshCategories } = useApi<{
    own_categories?: ServiceCategory[];
    data?: { own_categories?: ServiceCategory[] };
  }>("/api/provider/categories");

  const { data: service, loading: loadingService, error: serviceError } = useApi<Service>(
    serviceId ? `/api/provider/services/${serviceId}` : "",
    { enabled: !!serviceId },
  );

  const { data: allServicesRaw } = useApi<CatalogueServiceItem[]>(
    "/api/provider/services?include_inactive=true&include_variants=true",
  );

  const { data: staffData } = useApi<StaffMember[] | { data?: StaffMember[] }>("/api/provider/staff");

  const { data: refData } = useApi<Record<string, RefDataOption[]> | unknown>(
    "/api/provider/reference-data?type=service_type,duration,price_type,availability,tax_rate,reminder_unit,extra_time,addon_category",
  );

  const { data: resourcesData } = useApi<
    Array<{ id: string; name: string; group_name?: string | null }> | { data?: Array<{ id: string; name: string; group_name?: string | null }> }
  >("/api/provider/resources");

  const { data: serviceResources } = useApi<{ resources?: OfferingResourceEntry[] }>(
    serviceId ? `/api/provider/services/${serviceId}/resources` : "",
    { enabled: !!serviceId },
  );

  const { data: zoneSelectionsRaw, refresh: refreshZones } = useApi<
    Array<{ is_selected?: boolean }> | { data?: Array<{ is_selected?: boolean }> }
  >("/api/provider/zone-selections");

  const { execute: createService, loading: creating } = useApiMutation("post");
  const { execute: updateService, loading: updating } = useApiMutation("patch");
  const { execute: deleteService } = useApiMutation("delete");
  const { execute: putResources } = useApiMutation("put");
  const { execute: postMutation } = useApiMutation("post");

  const categories =
    categoriesRes?.own_categories ??
    (categoriesRes && "data" in categoriesRes ? categoriesRes.data?.own_categories : undefined) ??
    [];

  const allServices = Array.isArray(allServicesRaw) ? allServicesRaw : [];

  const staff = Array.isArray(staffData)
    ? staffData
    : staffData && typeof staffData === "object" && "data" in staffData && Array.isArray(staffData.data)
      ? staffData.data
      : [];

  const refObj =
    refData && typeof refData === "object" && !Array.isArray(refData)
      ? (refData as Record<string, RefDataOption[]>)
      : {};

  const serviceTypeOptions = refObj.service_type?.length
    ? refObj.service_type
    : [
        { value: "basic", label: "Basic" },
        { value: "variant", label: "Variant" },
        { value: "addon", label: "Add-on" },
        { value: "package", label: "Package" },
      ];

  const availabilityOptions = refObj.availability?.length
    ? refObj.availability
    : [
        { value: "everyone", label: "Everyone" },
        { value: "women", label: "Women" },
        { value: "men", label: "Men" },
      ];

  const taxRateOptions = refObj.tax_rate?.length
    ? refObj.tax_rate
    : [
        { value: "0", label: "No tax" },
        { value: "15", label: "15% VAT" },
      ];

  const durationOptions = refObj.duration?.length
    ? refObj.duration
    : [{ value: "60", label: "60 min" }];

  const priceTypeOptions = refObj.price_type?.length
    ? refObj.price_type
    : [{ value: "fixed", label: "Fixed" }];

  const extraTimeOptions = refObj.extra_time?.length
    ? refObj.extra_time
    : [{ value: "15", label: "15 min" }];

  const addonCategoryOptions = refObj.addon_category?.length
    ? refObj.addon_category
    : [{ value: "general", label: "General" }];

  const providerResources = Array.isArray(resourcesData)
    ? resourcesData
    : resourcesData && "data" in resourcesData && Array.isArray(resourcesData.data)
      ? resourcesData.data
      : [];

  const [form, setForm] = useState(defaultForm);
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([DEFAULT_PRICING_OPTION()]);
  const [advancedPricingRules, setAdvancedPricingRules] = useState<AdvancedPricingRule[]>([]);
  const [offeringResources, setOfferingResources] = useState<OfferingResourceEntry[]>([]);

  const [serviceTypeSheetOpen, setServiceTypeSheetOpen] = useState(false);
  const [availabilitySheetOpen, setAvailabilitySheetOpen] = useState(false);
  const [taxSheetOpen, setTaxSheetOpen] = useState(false);
  const [extraTimeSheetOpen, setExtraTimeSheetOpen] = useState(false);
  const [addonCategorySheetOpen, setAddonCategorySheetOpen] = useState(false);
  const [advancedPricingOpen, setAdvancedPricingOpen] = useState(false);
  const [includedPickerOpen, setIncludedPickerOpen] = useState(false);
  const [applicablePickerOpen, setApplicablePickerOpen] = useState(false);
  const hydratedServiceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (service) {
      const isFirstLoadForService = hydratedServiceIdRef.current !== service.id;
      if (isFirstLoadForService) {
        hydratedServiceIdRef.current = service.id;
        setForm({
          name: service.title || service.name || "",
          categoryId: service.provider_category_id ?? "",
          serviceType: service.service_type ?? "basic",
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
          reminderToRebookEnabled: service.reminder_to_rebook_enabled ?? false,
          reminderToRebookWeeks: String(service.reminder_to_rebook_weeks ?? 4),
          serviceCostPercentage: String(service.service_cost_percentage ?? 0),
          includedServices: service.included_services ?? [],
          applicableServiceIds: service.applicable_service_ids ?? [],
          addonCategory: service.addon_category ?? "general",
          isRecommended: service.is_recommended ?? false,
          parentServiceId: service.parent_service_id ?? "",
          variantName: service.variant_name ?? "",
          variantSortOrder: service.variant_sort_order ?? 0,
        });
        setPricingOptions(pricingOptionsFromService(service));
        setAdvancedPricingRules(service.advanced_pricing_rules ?? []);
      }
    } else if (!serviceId) {
      hydratedServiceIdRef.current = null;
      setForm({ ...defaultForm });
      setPricingOptions([DEFAULT_PRICING_OPTION()]);
      setAdvancedPricingRules([]);
      setOfferingResources([]);
    }
  }, [service, serviceId]);

  useEffect(() => {
    if (serviceResources?.resources) {
      setOfferingResources(serviceResources.resources);
    }
  }, [serviceResources]);

  const primaryPrice = pricingOptions[0]?.price ?? 0;
  const serviceCostAmount = useMemo(() => {
    const pct = parseFloat(form.serviceCostPercentage) || 0;
    return ((primaryPrice * pct) / 100).toFixed(2);
  }, [form.serviceCostPercentage, primaryPrice]);

  const handleCreateCategory = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const res = (await postMutation("/api/provider/categories", { name: trimmed })) as {
        data?: { id: string };
        error?: string;
      };
      if (res.error) {
        Alert.alert("Error", res.error);
        return null;
      }
      await refreshCategories();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return res.data?.id ? { value: res.data.id, label: trimmed } : null;
    },
    [postMutation, refreshCategories],
  );

  const zoneSelections = useMemo(() => {
    if (Array.isArray(zoneSelectionsRaw)) return zoneSelectionsRaw;
    if (zoneSelectionsRaw && typeof zoneSelectionsRaw === "object" && "data" in zoneSelectionsRaw) {
      return zoneSelectionsRaw.data ?? [];
    }
    return [];
  }, [zoneSelectionsRaw]);

  const checkZonesBeforeAtHome = useCallback(
    async (enable: boolean) => {
      if (!enable) {
        setForm((p) => ({ ...p, supportsAtHome: false }));
        return;
      }
      await refreshZones();
      const selected = zoneSelections.filter((z) => z.is_selected);
      if (selected.length === 0) {
        Alert.alert(
          "Service zones required",
          "Please select service zones before enabling at-home services.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open settings",
              onPress: () => router.push("/(app)/(tabs)/more/settings/service-zones" as never),
            },
          ],
        );
        return;
      }
      setForm((p) => ({ ...p, supportsAtHome: true }));
    },
    [router, refreshZones, zoneSelections],
  );

  const handleDelete = useCallback(() => {
    if (!serviceId) return;
    Alert.alert(
      "Delete service",
      `Remove "${form.name || "this service"}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteService(`/api/provider/services/${serviceId}`);
            if (error) {
              Alert.alert("Error", error);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            }
          },
        },
      ],
    );
  }, [serviceId, form.name, deleteService, router]);

  const handleSave = useCallback(async () => {
    const validationError = validateServiceForm({
      name: form.name,
      categoryId: form.categoryId,
      serviceType: form.serviceType,
      parentServiceId: form.parentServiceId,
      pricingOptions,
      includedServices: form.includedServices,
    });
    if (validationError) {
      Alert.alert("Validation", validationError);
      return;
    }

    const advError = validateAdvancedPricingRules(advancedPricingRules);
    if (advError) {
      Alert.alert("Validation", advError);
      return;
    }

    const payload = buildServicePayload({
      name: form.name,
      categoryId: form.categoryId,
      serviceType: form.serviceType,
      description: form.description,
      aftercareDescription: form.aftercareDescription,
      availableFor: form.availableFor,
      onlineBookable: form.onlineBookable,
      teamMemberIds: form.teamMemberIds,
      teamMemberCommissionEnabled: form.teamMemberCommissionEnabled,
      pricingOptions,
      advancedPricingRules,
      extraTimeEnabled: form.extraTimeEnabled,
      extraTimeDuration: parseInt(form.extraTimeDuration, 10) || 0,
      reminderToRebookEnabled: form.reminderToRebookEnabled,
      reminderToRebookWeeks: parseInt(form.reminderToRebookWeeks, 10) || 4,
      serviceCostPercentage: parseFloat(form.serviceCostPercentage) || 0,
      taxRate: parseFloat(form.taxRate) || 0,
      includedServices: form.includedServices,
      isActive: form.isActive,
      supportsAtSalon: form.supportsAtSalon,
      supportsAtHome: form.supportsAtHome,
      atHomeRadiusKm: form.supportsAtHome && form.atHomeRadiusKm ? parseFloat(form.atHomeRadiusKm) : null,
      atHomePriceAdjustment: form.supportsAtHome ? parseFloat(form.atHomePriceAdjustment) || 0 : 0,
      addonCategory: form.addonCategory,
      applicableServiceIds: form.applicableServiceIds,
      isRecommended: form.isRecommended,
      parentServiceId: form.parentServiceId,
      variantName: form.variantName,
      variantSortOrder: form.variantSortOrder,
    });

    let savedId = serviceId;

    if (isEdit && serviceId) {
      const { error } = await updateService(`/api/provider/services/${serviceId}`, payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { data, error } = (await createService("/api/provider/services", payload)) as {
        data?: { id?: string };
        error?: string | null;
      };
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      savedId = data?.id;
    }

    if (savedId && (form.serviceType === "basic" || form.serviceType === "variant")) {
      await putResources(
        `/api/provider/services/${savedId}/resources`,
        buildResourcesPayload(offeringResources),
      );
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }, [
    form,
    pricingOptions,
    advancedPricingRules,
    offeringResources,
    isEdit,
    serviceId,
    createService,
    updateService,
    putResources,
    router,
  ]);

  const isSaving = creating || updating;
  const showResources = form.serviceType === "basic" || form.serviceType === "variant";

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
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader
        title={isEdit ? "Edit Service" : "Add Service"}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={twStyle("min-h-[40px] flex-row items-center justify-center rounded-full bg-indigo-600 px-4")}
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
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={twStyle("px-1 pt-2")}>
            <FormField
              label="Service name *"
              value={form.name}
              onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
              placeholder="e.g. Signature Haircut"
            />

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Service type</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setServiceTypeSheetOpen(true)}
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {serviceTypeOptions.find((o) => o.value === form.serviceType)?.label ?? form.serviceType}
                </Text>
              </TouchableOpacity>
            </View>

            {form.serviceType === "package" ? (
              <ServiceIdsChips
                label="Included services"
                selectedIds={form.includedServices}
                services={allServices}
                onPressEdit={() => setIncludedPickerOpen(true)}
                emptyHint="Tap to select services included in this package"
              />
            ) : null}

            {form.serviceType === "addon" ? (
              <>
                <View style={twStyle("mb-3")}>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Add-on category</Text>
                  <TouchableOpacity
                    style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                    onPress={() => setAddonCategorySheetOpen(true)}
                  >
                    <Text style={twStyle("text-base text-gray-900")}>
                      {addonCategoryOptions.find((o) => o.value === form.addonCategory)?.label ??
                        form.addonCategory}
                    </Text>
                  </TouchableOpacity>
                </View>
                <ServiceIdsChips
                  label="Applicable services"
                  selectedIds={form.applicableServiceIds}
                  services={allServices}
                  onPressEdit={() => setApplicablePickerOpen(true)}
                  emptyHint="All services (tap to restrict)"
                />
                <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
                  <Text style={twStyle("text-sm font-medium text-gray-700")}>Recommended add-on</Text>
                  <Switch
                    value={form.isRecommended}
                    onValueChange={(v) => setForm((p) => ({ ...p, isRecommended: v }))}
                  />
                </View>
              </>
            ) : null}

            {form.serviceType === "variant" ? (
              <ParentServicePicker
                parentServiceId={form.parentServiceId}
                variantName={form.variantName}
                variantSortOrder={form.variantSortOrder}
                services={allServices}
                currentServiceId={serviceId}
                onChangeParent={(id) => setForm((p) => ({ ...p, parentServiceId: id }))}
                onChangeVariantName={(name) => setForm((p) => ({ ...p, variantName: name }))}
                onChangeSortOrder={(order) => setForm((p) => ({ ...p, variantSortOrder: order }))}
              />
            ) : null}

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Category *</Text>
              <ChipCombobox
                singleSelect
                value={form.categoryId || null}
                onChange={(v) => setForm((p) => ({ ...p, categoryId: v ?? "" }))}
                staticSuggestions={categories.map((c) => ({ value: c.id, label: c.name }))}
                onCreateNew={handleCreateCategory}
                placeholder="Select or add category"
              />
            </View>

            <FormField
              label="Description (optional)"
              value={form.description}
              onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
              multiline
            />
            <FormField
              label="Aftercare instructions (optional)"
              value={form.aftercareDescription}
              onChangeText={(t) => setForm((p) => ({ ...p, aftercareDescription: t }))}
              multiline
            />

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Available for</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setAvailabilitySheetOpen(true)}
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {availabilityOptions.find((o) => o.value === form.availableFor)?.label ??
                    form.availableFor}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Location</Text>
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
                onValueChange={(v) => void checkZonesBeforeAtHome(v)}
              />
            </View>
            {form.supportsAtHome ? (
              <>
                <FormField
                  label="At-home radius (km)"
                  value={form.atHomeRadiusKm}
                  onChangeText={(t) => setForm((p) => ({ ...p, atHomeRadiusKm: t }))}
                  keyboardType="decimal-pad"
                />
                <FormField
                  label={`At-home price adjustment (${getTenantDefaultCurrency()})`}
                  value={form.atHomePriceAdjustment}
                  onChangeText={(t) => setForm((p) => ({ ...p, atHomePriceAdjustment: t }))}
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}

            {showResources ? (
              <ResourceRequirementsEditor
                resources={providerResources}
                offeringResources={offeringResources}
                onChange={setOfferingResources}
              />
            ) : null}

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Online bookable</Text>
              <Switch
                value={form.onlineBookable}
                onValueChange={(v) => setForm((p) => ({ ...p, onlineBookable: v }))}
              />
            </View>

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Team members</Text>
              <ChipCombobox
                value={form.teamMemberIds}
                onChange={(ids) =>
                  setForm((p) => ({
                    ...p,
                    teamMemberIds: ids.includes("__any__") ? [] : ids.filter((id) => id !== "__any__"),
                  }))
                }
                staticSuggestions={[
                  { value: "__any__", label: "Any team member" },
                  ...staff.map((m) => ({ value: m.id, label: m.name })),
                ]}
                placeholder="Any or select staff"
              />
            </View>

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Team commission</Text>
              <Switch
                value={form.teamMemberCommissionEnabled}
                onValueChange={(v) => setForm((p) => ({ ...p, teamMemberCommissionEnabled: v }))}
              />
            </View>

            <PricingOptionsEditor
              options={pricingOptions}
              onChange={setPricingOptions}
              durationOptions={durationOptions}
              priceTypeOptions={priceTypeOptions}
              onOpenAdvancedPricing={() => setAdvancedPricingOpen(true)}
            />

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Extra (buffer) time</Text>
              <Switch
                value={form.extraTimeEnabled}
                onValueChange={(v) => setForm((p) => ({ ...p, extraTimeEnabled: v }))}
              />
            </View>
            {form.extraTimeEnabled ? (
              <View style={twStyle("mb-3")}>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Extra time duration</Text>
                <TouchableOpacity
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                  onPress={() => setExtraTimeSheetOpen(true)}
                >
                  <Text style={twStyle("text-base text-gray-900")}>
                    {extraTimeOptions.find((o) => o.value === form.extraTimeDuration)?.label ??
                      `${form.extraTimeDuration} min`}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Reminder to rebook</Text>
              <Switch
                value={form.reminderToRebookEnabled}
                onValueChange={(v) => setForm((p) => ({ ...p, reminderToRebookEnabled: v }))}
              />
            </View>
            {form.reminderToRebookEnabled ? (
              <FormField
                label="Reminder (weeks)"
                value={form.reminderToRebookWeeks}
                onChangeText={(t) => setForm((p) => ({ ...p, reminderToRebookWeeks: t.replace(/[^0-9]/g, "") }))}
                keyboardType="numeric"
              />
            ) : null}

            <FormField
              label="Service cost %"
              value={form.serviceCostPercentage}
              onChangeText={(t) => setForm((p) => ({ ...p, serviceCostPercentage: t }))}
              keyboardType="decimal-pad"
            />
            <Text style={twStyle("mb-3 text-xs text-gray-500")}>
              Estimated cost amount: {getTenantDefaultCurrency()} {serviceCostAmount}
            </Text>

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Tax rate</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setTaxSheetOpen(true)}
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {taxRateOptions.find((o) => o.value === form.taxRate)?.label ?? `${form.taxRate}%`}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <View>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
                <Text style={twStyle("text-xs text-gray-500")}>Inactive services won't appear in booking flows</Text>
              </View>
              <Switch
                value={form.isActive}
                onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              />
            </View>

            {isEdit && (
              <TouchableOpacity
                onPress={handleDelete}
                style={twStyle("mb-3 items-center rounded-xl border border-red-200 bg-red-50 py-3")}
                accessibilityLabel="Delete service"
              >
                <Text style={twStyle("text-sm font-medium text-red-600")}>Delete service</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AdvancedPricingRulesEditor
        visible={advancedPricingOpen}
        rules={advancedPricingRules}
        onClose={() => setAdvancedPricingOpen(false)}
        onSave={setAdvancedPricingRules}
      />

      <IncludedServicesPicker
        visible={includedPickerOpen}
        services={allServices}
        selectedIds={form.includedServices}
        currentServiceId={serviceId}
        onClose={() => setIncludedPickerOpen(false)}
        onChange={(ids) => setForm((p) => ({ ...p, includedServices: ids }))}
      />

      <ApplicableServicesPicker
        visible={applicablePickerOpen}
        services={allServices}
        selectedIds={form.applicableServiceIds}
        currentServiceId={serviceId}
        onClose={() => setApplicablePickerOpen(false)}
        onChange={(ids) => setForm((p) => ({ ...p, applicableServiceIds: ids }))}
      />

      <OptionSheet
        visible={serviceTypeSheetOpen}
        title="Service type"
        options={serviceTypeOptions}
        onSelect={(v) => setForm((p) => ({ ...p, serviceType: v }))}
        onClose={() => setServiceTypeSheetOpen(false)}
      />
      <OptionSheet
        visible={availabilitySheetOpen}
        title="Available for"
        options={availabilityOptions}
        onSelect={(v) => setForm((p) => ({ ...p, availableFor: v }))}
        onClose={() => setAvailabilitySheetOpen(false)}
      />
      <OptionSheet
        visible={taxSheetOpen}
        title="Tax rate"
        options={taxRateOptions}
        onSelect={(v) => setForm((p) => ({ ...p, taxRate: v }))}
        onClose={() => setTaxSheetOpen(false)}
      />
      <OptionSheet
        visible={extraTimeSheetOpen}
        title="Extra time"
        options={extraTimeOptions}
        onSelect={(v) => setForm((p) => ({ ...p, extraTimeDuration: v }))}
        onClose={() => setExtraTimeSheetOpen(false)}
      />
      <OptionSheet
        visible={addonCategorySheetOpen}
        title="Add-on category"
        options={addonCategoryOptions}
        onSelect={(v) => setForm((p) => ({ ...p, addonCategory: v }))}
        onClose={() => setAddonCategorySheetOpen(false)}
      />
    </ScreenContainer>
  );
}

function OptionSheet({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: RefDataOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={twStyle("max-h-80")}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.value}
            style={twStyle("border-b border-gray-100 py-3.5")}
            onPress={() => {
              onSelect(o.value);
              onClose();
            }}
          >
            <Text style={twStyle("text-base text-gray-900")}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
