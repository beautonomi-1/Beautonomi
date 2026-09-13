import { useMemo, useRef, useState, type RefObject } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const sf = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.serviceForm.${key}`, opts) as string;
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
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("serviceName")}</Text>
        {mode === "catalogue" ? (
          <Text style={twStyle("mb-2 text-xs text-gray-400")}>
            {sf("serviceNameHint")}
          </Text>
        ) : null}
        <TextInput
          ref={nameInputRef}
          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder={sf("serviceNamePlaceholder")}
          placeholderTextColor="#9ca3af"
          value={form.name}
          onChangeText={(text) => patchForm({ name: text })}
          onFocus={() => onNameFocus?.()}
          returnKeyType="next"
          blurOnSubmit={false}
          accessibilityLabel={sf("serviceNameA11y")}
        />
      </View>

      {showServiceType ? (
        <>
          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("serviceType")}</Text>
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
                {sf("variantTip")}
              </Text>
            ) : form.serviceType === "basic" ? (
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {sf("basicHint")}
              </Text>
            ) : null}
          </View>

          {form.serviceType === "package" ? (
            <ServiceIdsChips
              label={sf("includedServices")}
              selectedIds={form.includedServices}
              services={allServices}
              onPressEdit={() => setIncludedPickerOpen(true)}
              emptyHint={sf("includedServicesEmpty")}
            />
          ) : null}

          {form.serviceType === "addon" ? (
            <>
              <View style={twStyle("mb-3")}>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("addonCategory")}</Text>
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
                label={sf("applicableServices")}
                selectedIds={form.applicableServiceIds}
                services={allServices}
                onPressEdit={() => setApplicablePickerOpen(true)}
                emptyHint={sf("applicableServicesEmpty")}
              />
              <View
                style={twStyle(
                  "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
                )}
              >
                <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("recommendedAddon")}</Text>
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
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("categoryRequired")}</Text>
        <ChipCombobox
          singleSelect
          value={form.categoryId || null}
          onChange={(v) => patchForm({ categoryId: v ?? "" })}
          staticSuggestions={categories.map((c) => ({ value: c.id, label: c.name }))}
          onCreateNew={onCreateCategory}
          placeholder={sf("categoryPlaceholder")}
        />
      </View>

      <FormField
        label={sf("descriptionOptional")}
        value={form.description}
        onChangeText={(t) => setForm({ description: t })}
        multiline
        onFieldFocus={onFieldFocus}
      />

      {mode === "catalogue" ? (
        <FormField
          label={sf("aftercareOptional")}
          value={form.aftercareDescription}
          onChangeText={(t) => setForm({ aftercareDescription: t })}
          multiline
        />
      ) : null}

      <View style={twStyle("my-4 flex-row items-center gap-3")}>
        <View style={twStyle("h-px flex-1 bg-gray-200")} />
        <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400")}>{sf("pricing")}</Text>
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
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("availableFor")}</Text>
        <TouchableOpacity
          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          onPress={() => setAvailabilitySheetOpen(true)}
        >
          <Text style={twStyle("text-base text-gray-900")}>
            {availabilityOptions.find((o) => o.value === form.availableFor)?.label ?? form.availableFor}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>{sf("location")}</Text>
      <View
        style={twStyle(
          "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
        )}
      >
        <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("availableAtSalon")}</Text>
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
        <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("availableAtHome")}</Text>
        <Switch value={form.supportsAtHome} onValueChange={(v) => void handleAtHomeToggle(v)} />
      </View>

      {form.supportsAtHome ? (
        <>
          <FormField
            label={sf("atHomeRadius")}
            value={form.atHomeRadiusKm}
            onChangeText={(t) => setForm({ atHomeRadiusKm: t })}
            keyboardType="decimal-pad"
            placeholder={mode === "onboarding" ? sf("unlimited") : undefined}
            hint={mode === "onboarding" ? sf("atHomeRadiusHint") : undefined}
            onFieldFocus={onFieldFocus}
            inputAccessoryViewID="provider-service-at-home-radius"
          />
          <FormField
            label={sf("atHomePriceAdjustment", { currency: getTenantDefaultCurrency() })}
            value={form.atHomePriceAdjustment}
            onChangeText={(t) => setForm({ atHomePriceAdjustment: t })}
            keyboardType="decimal-pad"
            hint={mode === "onboarding" ? sf("atHomePriceHint") : undefined}
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
          <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("onlineBookable")}</Text>
          <Switch value={form.onlineBookable} onValueChange={(v) => setForm({ onlineBookable: v })} />
        </View>
        {mode === "onboarding" ? (
          <Text style={twStyle("mt-2 text-xs text-gray-400")}>
            {sf("onlineBookableHint")}
          </Text>
        ) : null}
      </View>

      {showTeam ? (
        <>
          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("teamMembers")}</Text>
            <ChipCombobox
              value={form.teamMemberIds}
              onChange={(ids) =>
                setForm({
                  teamMemberIds: ids.includes("__any__") ? [] : ids.filter((id) => id !== "__any__"),
                })
              }
              staticSuggestions={[
                { value: "__any__", label: sf("anyTeamMember") },
                ...staff.map((m) => ({ value: m.id, label: m.name })),
              ]}
              placeholder={sf("teamPlaceholder")}
            />
          </View>

          <View
            style={twStyle(
              "mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
            )}
          >
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("teamCommission")}</Text>
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
          <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("extraBufferTime")}</Text>
          <Switch
            value={form.extraTimeEnabled}
            onValueChange={(v) => setForm({ extraTimeEnabled: v })}
          />
        </View>
        {mode === "onboarding" ? (
          <Text style={twStyle("mt-2 text-xs text-gray-400")}>
            {sf("extraBufferHint")}
          </Text>
        ) : null}
      </View>
      {form.extraTimeEnabled ? (
        <View style={twStyle("mb-3")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("extraTimeDuration")}</Text>
          <TouchableOpacity
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
            onPress={() => setExtraTimeSheetOpen(true)}
          >
            <Text style={twStyle("text-base text-gray-900")}>
              {extraTimeOptions.find((o) => o.value === form.extraTimeDuration)?.label ??
                sf("extraTimeMin", { minutes: form.extraTimeDuration })}
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
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("reminderToRebook")}</Text>
            <Switch
              value={form.reminderToRebookEnabled}
              onValueChange={(v) => setForm({ reminderToRebookEnabled: v })}
            />
          </View>
          {form.reminderToRebookEnabled ? (
            <FormField
              label={sf("reminderWeeks")}
              value={form.reminderToRebookWeeks}
              onChangeText={(t) =>
                setForm({ reminderToRebookWeeks: t.replace(/[^0-9]/g, "") })
              }
              keyboardType="numeric"
            />
          ) : null}

          <FormField
            label={sf("serviceCostPercent")}
            value={form.serviceCostPercentage}
            onChangeText={(t) => setForm({ serviceCostPercentage: t })}
            keyboardType="decimal-pad"
          />
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            {sf("estimatedCost", { currency: getTenantDefaultCurrency(), amount: serviceCostAmount })}
          </Text>
        </>
      ) : null}

      <View style={twStyle("mb-3")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{sf("taxRate")}</Text>
        <TouchableOpacity
          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          onPress={() => setTaxSheetOpen(true)}
        >
          <Text style={twStyle("text-base text-gray-900")}>
            {taxRateOptions.find((o) => o.value === form.taxRate)?.label ?? sf("taxRatePercent", { rate: form.taxRate })}
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
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{sf("active")}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              {sf("inactiveHint")}
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
        title={sf("serviceType")}
        options={serviceTypeOptions}
        onSelect={(v) => setForm({ serviceType: v })}
        onClose={() => setServiceTypeSheetOpen(false)}
      />
      <OptionSheet
        visible={availabilitySheetOpen}
        title={sf("availableFor")}
        options={availabilityOptions}
        onSelect={(v) => setForm({ availableFor: v })}
        onClose={() => setAvailabilitySheetOpen(false)}
      />
      <OptionSheet
        visible={taxSheetOpen}
        title={sf("taxRate")}
        options={taxRateOptions}
        onSelect={(v) => setForm({ taxRate: v })}
        onClose={() => setTaxSheetOpen(false)}
      />
      <OptionSheet
        visible={extraTimeSheetOpen}
        title={sf("extraTime")}
        options={extraTimeOptions}
        onSelect={(v) => setForm({ extraTimeDuration: v })}
        onClose={() => setExtraTimeSheetOpen(false)}
      />
      <OptionSheet
        visible={addonCategorySheetOpen}
        title={sf("addonCategory")}
        options={addonCategoryOptions}
        onSelect={(v) => setForm({ addonCategory: v })}
        onClose={() => setAddonCategorySheetOpen(false)}
      />
    </>
  );
}
