import { useMemo, useRef, useState, type RefObject } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch } from "react-native";
import { KeyboardDoneAccessory } from "@/features/provider-onboarding/KeyboardDoneAccessory";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import { PricingOptionsEditor } from "@/features/catalogue/PricingOptionsEditor";
import {
  ApplicableServicesPicker,
  IncludedServicesPicker,
  ServiceIdsChips,
} from "@/features/catalogue/ServiceIdsPicker";
import { ParentServicePicker } from "@/features/catalogue/ParentServicePicker";
import { ResourceRequirementsEditor } from "@/features/catalogue/ResourceRequirementsEditor";
import type { CatalogueServiceItem, OfferingResourceEntry, RefDataOption } from "./types";
import {
  resolveRefDataOptions,
  type ServiceCategoryOption,
  type ServiceFormRefData,
  type ServiceFormState,
} from "./service-form-state";

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  hint,
  onFieldFocus,
  inputAccessoryViewID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  multiline?: boolean;
  hint?: string;
  onFieldFocus?: (inputRef: RefObject<TextInput | null>) => void;
  inputAccessoryViewID?: string;
}) {
  const inputRef = useRef<TextInput>(null);
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      {hint ? <Text style={twStyle("mb-2 text-xs text-gray-400")}>{hint}</Text> : null}
      <TextInput
        ref={inputRef}
        style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? "top" : "center"}
        onFocus={() => onFieldFocus?.(inputRef)}
        inputAccessoryViewID={inputAccessoryViewID}
      />
      {inputAccessoryViewID ? <KeyboardDoneAccessory nativeID={inputAccessoryViewID} /> : null}
    </View>
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
            style={twStyle("border-b border-gray-100 px-1 py-3.5")}
            onPress={() => {
              onSelect(o.value);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={o.description ? `${o.label}. ${o.description}` : o.label}
          >
            <Text style={twStyle("text-base font-medium text-gray-900")}>{o.label}</Text>
            {o.description ? (
              <Text style={twStyle("mt-0.5 text-xs leading-5 text-gray-500")}>{o.description}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

export interface ServiceFormFieldsProps {
  mode: "catalogue" | "onboarding";
  value: ServiceFormState;
  onChange: (next: ServiceFormState) => void;
  categories: ServiceCategoryOption[];
  refData: ServiceFormRefData | Record<string, RefDataOption[]>;
  businessType?: "salon" | "mobile" | "both";
  showServiceType?: boolean;
  showTeam?: boolean;
  showResources?: boolean;
  showAdvancedPricing?: boolean;
  showActiveToggle?: boolean;
  staff?: { id: string; name: string }[];
  allServices?: CatalogueServiceItem[];
  serviceId?: string;
  offeringResources?: OfferingResourceEntry[];
  providerResources?: { id: string; name: string; group_name?: string | null }[];
  onOfferingResourcesChange?: (resources: OfferingResourceEntry[]) => void;
  onCreateCategory?: (name: string) => Promise<{ value: string; label: string } | null>;
  onCheckZonesBeforeAtHome?: (enable: boolean) => void | Promise<void>;
  onOpenAdvancedPricing?: () => void;
  onClearValidationError?: () => void;
  nameInputRef?: RefObject<TextInput | null>;
  onNameFocus?: () => void;
  onFieldFocus?: (inputRef: RefObject<TextInput | null>) => void;
}

export function ServiceFormFields({
  mode,
  value,
  onChange,
  categories,
  refData,
  showServiceType = mode === "catalogue",
  showTeam = mode === "catalogue",
  showResources = mode === "catalogue",
  showAdvancedPricing = mode === "catalogue",
  showActiveToggle = mode === "catalogue",
  staff = [],
  allServices = [],
  serviceId,
  offeringResources = [],
  providerResources = [],
  onOfferingResourcesChange,
  onCreateCategory,
  onCheckZonesBeforeAtHome,
  onOpenAdvancedPricing,
  onClearValidationError,
  nameInputRef,
  onNameFocus,
  onFieldFocus,
}: ServiceFormFieldsProps) {
  const form = value;
  const setForm = (patch: Partial<ServiceFormState> | ((prev: ServiceFormState) => ServiceFormState)) => {
    if (typeof patch === "function") {
      onChange(patch(form));
      return;
    }
    onChange({ ...form, ...patch });
  };

  const {
    serviceTypeOptions,
    availabilityOptions,
    taxRateOptions,
    durationOptions,
    priceTypeOptions,
    extraTimeOptions,
    addonCategoryOptions,
  } = useMemo(() => resolveRefDataOptions(refData), [refData]);

  const [serviceTypeSheetOpen, setServiceTypeSheetOpen] = useState(false);
  const [availabilitySheetOpen, setAvailabilitySheetOpen] = useState(false);
  const [taxSheetOpen, setTaxSheetOpen] = useState(false);
  const [extraTimeSheetOpen, setExtraTimeSheetOpen] = useState(false);
  const [addonCategorySheetOpen, setAddonCategorySheetOpen] = useState(false);
  const [includedPickerOpen, setIncludedPickerOpen] = useState(false);
  const [applicablePickerOpen, setApplicablePickerOpen] = useState(false);

  const primaryPrice = form.pricingOptions[0]?.price ?? 0;
  const serviceCostAmount = useMemo(() => {
    const pct = parseFloat(form.serviceCostPercentage) || 0;
    return ((primaryPrice * pct) / 100).toFixed(2);
  }, [form.serviceCostPercentage, primaryPrice]);

  const showResourceEditor =
    showResources && (form.serviceType === "basic" || form.serviceType === "variant");

  const handleAtHomeToggle = (enable: boolean) => {
    if (mode === "catalogue" && onCheckZonesBeforeAtHome) {
      void onCheckZonesBeforeAtHome(enable);
      return;
    }
    patchForm({ supportsAtHome: enable });
  };

  const patchForm = (patch: Partial<ServiceFormState>) => {
    onClearValidationError?.();
    setForm(patch);
  };

  const setPricingOptions = (options: ServiceFormState["pricingOptions"]) => {
    onChange({ ...form, pricingOptions: options });
  };

  return (
    <>
      <View style={twStyle("mb-3")} collapsable={false}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Service name *</Text>
        {mode === "catalogue" ? (
          <Text style={twStyle("mb-2 text-xs text-gray-400")}>
            This is what customers will see when browsing your services.
          </Text>
        ) : null}
        <TextInput
          ref={nameInputRef}
          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder="e.g. Signature Haircut"
          placeholderTextColor="#9ca3af"
          value={form.name}
          onChangeText={(t) => patchForm({ name: t })}
          onFocus={() => onNameFocus?.()}
          returnKeyType="next"
          blurOnSubmit={false}
          accessibilityLabel="Service name"
        />
      </View>

      {showServiceType ? (
        <>
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
            {form.serviceType === "variant" ? (
              <Text style={twStyle("mt-1 text-xs text-amber-700")}>
                Tip: For multiple prices on one service, choose Basic and use booking options below instead.
              </Text>
            ) : form.serviceType === "basic" ? (
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                Set price and duration below. Add more options if customers should choose (e.g. short vs long).
              </Text>
            ) : null}
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
              <View
                style={twStyle(
                  "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
                )}
              >
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Recommended add-on</Text>
                <Switch
                  value={form.isRecommended}
                  onValueChange={(v) => setForm({ isRecommended: v })}
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
              onChangeParent={(id) => setForm({ parentServiceId: id })}
              onChangeVariantName={(name) => setForm({ variantName: name })}
              onChangeSortOrder={(order) => setForm({ variantSortOrder: order })}
            />
          ) : null}
        </>
      ) : null}

      <View style={twStyle("mb-3")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Category *</Text>
        <ChipCombobox
          singleSelect
          value={form.categoryId || null}
          onChange={(v) => patchForm({ categoryId: v ?? "" })}
          staticSuggestions={categories.map((c) => ({ value: c.id, label: c.name }))}
          onCreateNew={onCreateCategory}
          placeholder="Select or add category"
        />
      </View>

      <FormField
        label="Description (optional)"
        value={form.description}
        onChangeText={(t) => setForm({ description: t })}
        multiline
        onFieldFocus={onFieldFocus}
      />

      {mode === "catalogue" ? (
        <FormField
          label="Aftercare instructions (optional)"
          value={form.aftercareDescription}
          onChangeText={(t) => setForm({ aftercareDescription: t })}
          multiline
        />
      ) : null}

      <View style={twStyle("my-4 flex-row items-center gap-3")}>
        <View style={twStyle("h-px flex-1 bg-gray-200")} />
        <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400")}>Pricing</Text>
        <View style={twStyle("h-px flex-1 bg-gray-200")} />
      </View>

      <PricingOptionsEditor
        options={form.pricingOptions}
        onChange={setPricingOptions}
        durationOptions={durationOptions}
        priceTypeOptions={priceTypeOptions}
        onOpenAdvancedPricing={
          showAdvancedPricing && form.serviceType !== "variant" ? onOpenAdvancedPricing : undefined
        }
        parentPricingName={form.pricingOptions[0]?.pricingName ?? null}
        serviceTitle={form.name.trim() || undefined}
        allowMultipleTiers={form.serviceType !== "variant"}
        onFieldFocus={onFieldFocus}
      />

      <View style={twStyle("mb-3")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Available for</Text>
        <TouchableOpacity
          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          onPress={() => setAvailabilitySheetOpen(true)}
        >
          <Text style={twStyle("text-base text-gray-900")}>
            {availabilityOptions.find((o) => o.value === form.availableFor)?.label ?? form.availableFor}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Location</Text>
      <View
        style={twStyle(
          "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
        )}
      >
        <Text style={twStyle("text-sm font-medium text-gray-700")}>Available at salon</Text>
        <Switch
          value={form.supportsAtSalon}
          onValueChange={(v) => setForm({ supportsAtSalon: v })}
        />
      </View>
      <View
        style={twStyle(
          "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
        )}
      >
        <Text style={twStyle("text-sm font-medium text-gray-700")}>Available at home</Text>
        <Switch value={form.supportsAtHome} onValueChange={(v) => void handleAtHomeToggle(v)} />
      </View>

      {form.supportsAtHome ? (
        <>
          <FormField
            label="At-home radius (km)"
            value={form.atHomeRadiusKm}
            onChangeText={(t) => setForm({ atHomeRadiusKm: t })}
            keyboardType="decimal-pad"
            placeholder={mode === "onboarding" ? "Unlimited" : undefined}
            hint={
              mode === "onboarding"
                ? "Maximum distance from your base for at-home bookings. Leave blank for no limit."
                : undefined
            }
            onFieldFocus={onFieldFocus}
            inputAccessoryViewID="provider-service-at-home-radius"
          />
          <FormField
            label={`At-home price adjustment (${getTenantDefaultCurrency()})`}
            value={form.atHomePriceAdjustment}
            onChangeText={(t) => setForm({ atHomePriceAdjustment: t })}
            keyboardType="decimal-pad"
            hint={
              mode === "onboarding"
                ? "Additional charge (or discount if negative) for at-home service."
                : undefined
            }
            onFieldFocus={onFieldFocus}
            inputAccessoryViewID="provider-service-at-home-price"
          />
        </>
      ) : null}

      {showResourceEditor && onOfferingResourcesChange ? (
        <ResourceRequirementsEditor
          resources={providerResources}
          offeringResources={offeringResources}
          onChange={onOfferingResourcesChange}
        />
      ) : null}

      <View
        style={twStyle(
          "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
        )}
      >
        <View style={twStyle("flex-row items-center justify-between")}>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Online bookable</Text>
          <Switch value={form.onlineBookable} onValueChange={(v) => setForm({ onlineBookable: v })} />
        </View>
        {mode === "onboarding" ? (
          <Text style={twStyle("mt-2 text-xs text-gray-400")}>
            When on, customers can book this service online through Beautonomi.
          </Text>
        ) : null}
      </View>

      {showTeam ? (
        <>
          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Team members</Text>
            <ChipCombobox
              value={form.teamMemberIds}
              onChange={(ids) =>
                setForm({
                  teamMemberIds: ids.includes("__any__") ? [] : ids.filter((id) => id !== "__any__"),
                })
              }
              staticSuggestions={[
                { value: "__any__", label: "Any team member" },
                ...staff.map((m) => ({ value: m.id, label: m.name })),
              ]}
              placeholder="Any or select staff"
            />
          </View>

          <View
            style={twStyle(
              "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
            )}
          >
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Team commission</Text>
            <Switch
              value={form.teamMemberCommissionEnabled}
              onValueChange={(v) => setForm({ teamMemberCommissionEnabled: v })}
            />
          </View>
        </>
      ) : null}

      <View
        style={twStyle(
          "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
        )}
      >
        <View style={twStyle("flex-row items-center justify-between")}>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Extra (buffer) time</Text>
          <Switch
            value={form.extraTimeEnabled}
            onValueChange={(v) => setForm({ extraTimeEnabled: v })}
          />
        </View>
        {mode === "onboarding" ? (
          <Text style={twStyle("mt-2 text-xs text-gray-400")}>
            Add buffer time after the service for cleanup or transition between appointments.
          </Text>
        ) : null}
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

      {mode === "catalogue" ? (
        <>
          <View
            style={twStyle(
              "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
            )}
          >
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Reminder to rebook</Text>
            <Switch
              value={form.reminderToRebookEnabled}
              onValueChange={(v) => setForm({ reminderToRebookEnabled: v })}
            />
          </View>
          {form.reminderToRebookEnabled ? (
            <FormField
              label="Reminder (weeks)"
              value={form.reminderToRebookWeeks}
              onChangeText={(t) =>
                setForm({ reminderToRebookWeeks: t.replace(/[^0-9]/g, "") })
              }
              keyboardType="numeric"
            />
          ) : null}

          <FormField
            label="Service cost %"
            value={form.serviceCostPercentage}
            onChangeText={(t) => setForm({ serviceCostPercentage: t })}
            keyboardType="decimal-pad"
          />
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            Estimated cost amount: {getTenantDefaultCurrency()} {serviceCostAmount}
          </Text>
        </>
      ) : null}

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

      {showActiveToggle ? (
        <View
          style={twStyle(
            "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
          )}
        >
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              Inactive services won&apos;t appear in booking flows
            </Text>
          </View>
          <Switch value={form.isActive} onValueChange={(v) => setForm({ isActive: v })} />
        </View>
      ) : null}

      <IncludedServicesPicker
        visible={includedPickerOpen}
        services={allServices}
        selectedIds={form.includedServices}
        currentServiceId={serviceId}
        onClose={() => setIncludedPickerOpen(false)}
        onChange={(ids) => setForm({ includedServices: ids })}
      />

      <ApplicableServicesPicker
        visible={applicablePickerOpen}
        services={allServices}
        selectedIds={form.applicableServiceIds}
        currentServiceId={serviceId}
        onClose={() => setApplicablePickerOpen(false)}
        onChange={(ids) => setForm({ applicableServiceIds: ids })}
      />

      <OptionSheet
        visible={serviceTypeSheetOpen}
        title="Service type"
        options={serviceTypeOptions}
        onSelect={(v) => setForm({ serviceType: v })}
        onClose={() => setServiceTypeSheetOpen(false)}
      />
      <OptionSheet
        visible={availabilitySheetOpen}
        title="Available for"
        options={availabilityOptions}
        onSelect={(v) => setForm({ availableFor: v })}
        onClose={() => setAvailabilitySheetOpen(false)}
      />
      <OptionSheet
        visible={taxSheetOpen}
        title="Tax rate"
        options={taxRateOptions}
        onSelect={(v) => setForm({ taxRate: v })}
        onClose={() => setTaxSheetOpen(false)}
      />
      <OptionSheet
        visible={extraTimeSheetOpen}
        title="Extra time"
        options={extraTimeOptions}
        onSelect={(v) => setForm({ extraTimeDuration: v })}
        onClose={() => setExtraTimeSheetOpen(false)}
      />
      <OptionSheet
        visible={addonCategorySheetOpen}
        title="Add-on category"
        options={addonCategoryOptions}
        onSelect={(v) => setForm({ addonCategory: v })}
        onClose={() => setAddonCategorySheetOpen(false)}
      />
    </>
  );
}
