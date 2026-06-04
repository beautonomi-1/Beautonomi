import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";
import { AdvancedPricingRulesEditor } from "@/features/catalogue/AdvancedPricingRulesEditor";
import { ServiceFormFields } from "@/features/catalogue/ServiceFormFields";
import { buildServicePayload, buildResourcesPayload } from "@/features/catalogue/buildServicePayload";
import { validateAdvancedPricingRules, validateServiceForm } from "@/features/catalogue/validateServiceForm";
import {
  DEFAULT_SERVICE_FORM_STATE,
  type ServiceFormState,
} from "@/features/catalogue/service-form-state";
import type {
  AdvancedPricingRule,
  CatalogueServiceItem,
  OfferingResourceEntry,
  RefDataOption,
} from "@/features/catalogue/types";
import { pricingOptionsFromService } from "@/features/catalogue/types";

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

function serviceToFormState(service: Service): ServiceFormState {
  const base = DEFAULT_SERVICE_FORM_STATE();
  return {
    ...base,
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
    pricingOptions: pricingOptionsFromService(service),
    advancedPricingRules: service.advanced_pricing_rules ?? [],
  };
}

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
    { id: string; name: string; group_name?: string | null }[] | { data?: { id: string; name: string; group_name?: string | null }[] }
  >("/api/provider/resources");

  const { data: serviceResources } = useApi<{ resources?: OfferingResourceEntry[] }>(
    serviceId ? `/api/provider/services/${serviceId}/resources` : "",
    { enabled: !!serviceId },
  );

  const { data: zoneSelectionsRaw, refresh: refreshZones } = useApi<
    { is_selected?: boolean }[] | { data?: { is_selected?: boolean }[] }
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

  const providerResources = Array.isArray(resourcesData)
    ? resourcesData
    : resourcesData && "data" in resourcesData && Array.isArray(resourcesData.data)
      ? resourcesData.data
      : [];

  const [form, setForm] = useState<ServiceFormState>(DEFAULT_SERVICE_FORM_STATE());
  const [offeringResources, setOfferingResources] = useState<OfferingResourceEntry[]>([]);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const [advancedPricingOpen, setAdvancedPricingOpen] = useState(false);
  const hydratedServiceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (service) {
      const isFirstLoadForService = hydratedServiceIdRef.current !== service.id;
      if (isFirstLoadForService) {
        hydratedServiceIdRef.current = service.id;
        setForm(serviceToFormState(service));
      }
    } else if (!serviceId) {
      hydratedServiceIdRef.current = null;
      setForm(DEFAULT_SERVICE_FORM_STATE());
      setOfferingResources([]);
    }
  }, [service, serviceId]);

  useEffect(() => {
    if (serviceResources?.resources) {
      setOfferingResources(serviceResources.resources);
    }
  }, [serviceResources]);

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

  const handleDeactivate = useCallback(async () => {
    if (!serviceId) return;
    const { error } = await updateService(`/api/provider/services/${serviceId}`, { is_active: false });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }, [serviceId, updateService, router]);

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
              const cannotDelete =
                /booking|foreign|constraint|referenced|in use|cannot be deleted|violates/i.test(error);
              if (cannotDelete) {
                Alert.alert(
                  "Cannot delete",
                  "This service is linked to bookings or other records. Deactivate it instead?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Deactivate", onPress: () => void handleDeactivate() },
                  ],
                );
              } else {
                Alert.alert("Error", error);
              }
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            }
          },
        },
      ],
    );
  }, [serviceId, form.name, deleteService, router, handleDeactivate]);

  const handleSave = useCallback(async () => {
    setFormValidationError(null);
    const validationError = validateServiceForm({
      name: form.name,
      categoryId: form.categoryId,
      serviceType: form.serviceType,
      parentServiceId: form.parentServiceId,
      pricingOptions: form.pricingOptions,
      includedServices: form.includedServices,
      parentPricingName: form.pricingOptions[0]?.pricingName ?? null,
    });
    if (validationError) {
      setFormValidationError(validationError);
      return;
    }

    const advError = validateAdvancedPricingRules(form.advancedPricingRules);
    if (advError) {
      setFormValidationError(advError);
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
      pricingOptions: form.pricingOptions,
      advancedPricingRules: form.advancedPricingRules,
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
    let variantSyncMessage: string | null = null;

    if (isEdit && serviceId) {
      const { data, error } = (await updateService(`/api/provider/services/${serviceId}`, payload)) as {
        data?: { variant_sync?: { synced?: number; errors?: string[] } };
        error?: string | null;
      };
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      const sync = data?.variant_sync;
      if (form.pricingOptions.length > 1) {
        if (sync?.errors?.length) {
          variantSyncMessage = `Service saved, but tier sync had issues: ${sync.errors[0]}`;
        } else if (sync?.synced != null) {
          variantSyncMessage = `${sync.synced} booking tier${sync.synced === 1 ? "" : "s"} synced for customers.`;
        }
      }
    } else {
      const { data, error } = (await createService("/api/provider/services", payload)) as {
        data?: { id?: string; variant_sync?: { synced?: number; errors?: string[] } };
        error?: string | null;
      };
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      savedId = data?.id;
      const sync = data?.variant_sync;
      if (form.pricingOptions.length > 1) {
        if (sync?.errors?.length) {
          variantSyncMessage = `Service saved, but tier sync had issues: ${sync.errors[0]}`;
        } else if (sync?.synced != null) {
          variantSyncMessage = `${sync.synced} booking tier${sync.synced === 1 ? "" : "s"} synced for customers.`;
        }
      }
    }

    if (savedId && (form.serviceType === "basic" || form.serviceType === "variant")) {
      await putResources(
        `/api/provider/services/${savedId}/resources`,
        buildResourcesPayload(offeringResources),
      );
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (variantSyncMessage) {
      Alert.alert("Service saved", variantSyncMessage, [{ text: "OK", onPress: () => router.back() }]);
    } else {
      router.back();
    }
  }, [
    form,
    offeringResources,
    isEdit,
    serviceId,
    createService,
    updateService,
    putResources,
    router,
  ]);

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
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader
        title={isEdit ? "Edit Service" : "Add Service"}
        subtitle={
          isEdit
            ? service?.title || service?.name || form.name || undefined
            : "Pricing, team, location, variants, and booking settings"
        }
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            <ServiceFormFields
              mode="catalogue"
              value={form}
              onChange={setForm}
              categories={categories}
              refData={refObj}
              showServiceType
              showTeam
              showResources
              showAdvancedPricing
              showActiveToggle
              staff={staff}
              allServices={allServices}
              serviceId={serviceId}
              offeringResources={offeringResources}
              providerResources={providerResources}
              onOfferingResourcesChange={setOfferingResources}
              onCreateCategory={handleCreateCategory}
              onCheckZonesBeforeAtHome={checkZonesBeforeAtHome}
              onOpenAdvancedPricing={() => setAdvancedPricingOpen(true)}
              onClearValidationError={() => setFormValidationError(null)}
            />
          </View>
        </ScrollView>

        <View style={twStyle("border-t border-gray-100 bg-white px-4 py-3")}>
          {formValidationError ? (
            <View style={twStyle("mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex-row items-start gap-2")}>
              <Ionicons name="alert-circle-outline" size={18} color="#dc2626" style={{ marginTop: 1 }} />
              <Text style={twStyle("text-sm font-medium text-red-700 flex-1")}>{formValidationError}</Text>
            </View>
          ) : null}
          {isEdit && (
            <TouchableOpacity
              onPress={handleDelete}
              style={twStyle("mb-3 items-center rounded-xl border border-red-200 py-3")}
              accessibilityLabel="Delete service"
              accessibilityRole="button"
            >
              <Text style={twStyle("font-medium text-red-600")}>Delete service</Text>
            </TouchableOpacity>
          )}
          <ActionButton
            label={isSaving ? "Saving…" : isEdit ? "Save changes" : "Create service"}
            onPress={handleSave}
            loading={isSaving}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>

      <AdvancedPricingRulesEditor
        visible={advancedPricingOpen}
        rules={form.advancedPricingRules}
        onClose={() => setAdvancedPricingOpen(false)}
        onSave={(rules) => setForm((p) => ({ ...p, advancedPricingRules: rules }))}
      />
    </ScreenContainer>
  );
}
