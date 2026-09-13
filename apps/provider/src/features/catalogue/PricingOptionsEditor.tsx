import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useCallback, useRef, useState, type RefObject } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { KeyboardDoneAccessory } from "@/features/provider-onboarding/KeyboardDoneAccessory";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import type { PricingOption, RefDataOption } from "./types";
import {
  DEFAULT_PRICING_OPTION,
  buildCustomerBookingTierPreview,
  resolveBookingTierName,
} from "./types";
import { BookingTierCustomerPreview } from "./BookingTierCustomerPreview";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface PricingOptionsEditorProps {
  options: PricingOption[];
  onChange: (options: PricingOption[]) => void;
  durationOptions: RefDataOption[];
  priceTypeOptions: RefDataOption[];
  onOpenAdvancedPricing?: () => void;
  currencyLabel?: string;
  parentPricingName?: string | null;
  serviceTitle?: string;
  /** When false, hides multi-tier UX (for standalone variant offerings). */
  allowMultipleTiers?: boolean;
  onFieldFocus?: (inputRef: RefObject<TextInput | null>) => void;
}

function OptionPickerSheet({
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
    </BottomSheet>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{title}</Text>
      <Text style={twStyle("mt-0.5 text-xs leading-5 text-gray-500")}>{subtitle}</Text>
    </View>
  );
}

export function PricingOptionsEditor({
  options,
  onChange,
  durationOptions,
  priceTypeOptions,
  onOpenAdvancedPricing,
  parentPricingName,
  serviceTitle,
  allowMultipleTiers = true,
  onFieldFocus,
}: PricingOptionsEditorProps) {
  const { t } = useTranslation();
  const po = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.pricingOptions." + key, opts) as string,
    [t],
  );
  const [picker, setPicker] = useState<{
    rowId: string;
    field: "duration" | "priceType";
  } | null>(null);
  const [expandedPriceType, setExpandedPriceType] = useState<Record<string, boolean>>({});
  const priceInputRefs = useRef<Map<string, TextInput | null>>(new Map());
  const labelInputRefs = useRef<Map<string, TextInput | null>>(new Map());

  const currency = getTenantDefaultCurrency();
  const multiTier = allowMultipleTiers && options.length > 1;
  const customerPreview = buildCustomerBookingTierPreview(options, parentPricingName);

  const updateRow = (id: string, patch: Partial<PricingOption>) => {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const addRow = () => {
    onChange([...options, DEFAULT_PRICING_OPTION()]);
  };

  const removeRow = (id: string) => {
    if (options.length <= 1) return;
    onChange(options.filter((o) => o.id !== id));
  };

  const pickerOptions =
    picker?.field === "duration"
      ? durationOptions
      : picker?.field === "priceType"
        ? priceTypeOptions
        : [];

  const durationLabel = (minutes: number) =>
    durationOptions.find((d) => d.value === String(minutes))?.label ?? po("minutesShort", { count: minutes });

  const priceTypeLabel = (value: string) =>
    priceTypeOptions.find((p) => p.value === value)?.label ?? value;

  return (
    <View style={twStyle("mb-4")}>
      {multiTier ? (
        <>
          <SectionHeader
            title={po("bookingOptions")}
            subtitle={po("bookingOptionsHint")}
          />
          <BookingTierCustomerPreview tiers={customerPreview} serviceTitle={serviceTitle} />
        </>
      ) : (
        <SectionHeader
          title={po("priceDuration")}
          subtitle={
            allowMultipleTiers
              ? po("priceDurationSingleHint")
              : po("priceDurationVariantHint")
          }
        />
      )}

      {options.map((row, index) => {
        const previewName = resolveBookingTierName(row, index, parentPricingName);
        const showPriceType =
          multiTier || expandedPriceType[row.id] || row.priceType !== "fixed";
        const priceAccessoryId = `provider-pricing-price-${row.id}`;

        return (
          <View
            key={row.id}
            style={twStyle(
              `mb-3 overflow-hidden rounded-2xl border bg-white ${
                multiTier && index === 0 ? "border-indigo-200" : "border-gray-200"
              }`,
            )}
          >
            {multiTier ? (
              <View
                style={twStyle(
                  `flex-row items-center justify-between border-b px-4 py-3 ${
                    index === 0 ? "border-indigo-100 bg-indigo-50/50" : "border-gray-100 bg-gray-50"
                  }`,
                )}
              >
                <View style={twStyle("flex-1 pe-2")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {previewName}
                    {index === 0 ? (
                      <Text style={twStyle("text-xs font-normal text-gray-500")}>{po("defaultInCatalogue")}</Text>
                    ) : null}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {durationLabel(row.duration)} · {formatCurrency(row.price, currency)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeRow(row.id)}
                  hitSlop={12}
                  accessibilityLabel={po("removeA11y", { name: previewName })}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={twStyle("gap-3 p-4")}>
              <View style={twStyle("flex-row gap-3")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("duration")}</Text>
                  <TouchableOpacity
                    style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-3 py-3")}
                    onPress={() => setPicker({ rowId: row.id, field: "duration" })}
                    accessibilityLabel={po("durationA11y", { name: previewName })}
                  >
                    <Text style={twStyle("text-base text-gray-900")}>{durationLabel(row.duration)}</Text>
                  </TouchableOpacity>
                </View>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("price")}</Text>
                  <View style={twStyle("relative")}>
                    <Text
                      style={twStyle("absolute left-3 top-3 text-sm text-gray-400")}
                      pointerEvents="none"
                    >
                      {currency}
                    </Text>
                    <TextInput
                      ref={(r) => {
                        priceInputRefs.current.set(row.id, r);
                      }}
                      style={twStyle(
                        "rounded-xl border border-gray-200 bg-gray-50 py-3 ps-12 pe-3 text-base text-gray-900",
                      )}
                      value={row.price > 0 ? String(row.price) : ""}
                      onChangeText={(t) => updateRow(row.id, { price: parseFloat(t) || 0 })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      accessibilityLabel={po("priceA11y", { name: previewName })}
                      onFocus={() =>
                        onFieldFocus?.({
                          current: priceInputRefs.current.get(row.id) ?? null,
                        })
                      }
                      inputAccessoryViewID={priceAccessoryId}
                    />
                    <KeyboardDoneAccessory nativeID={priceAccessoryId} />
                  </View>
                </View>
              </View>

              {multiTier ? (
                <View>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("customerLabel")}</Text>
                  <TextInput
                    ref={(r) => {
                      labelInputRefs.current.set(row.id, r);
                    }}
                    style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-base text-gray-900")}
                    value={row.pricingName}
                    onChangeText={(t) => updateRow(row.id, { pricingName: t })}
                    placeholder={previewName}
                    accessibilityLabel={po("labelA11y", { number: index + 1 })}
                    onFocus={() =>
                      onFieldFocus?.({
                        current: labelInputRefs.current.get(row.id) ?? null,
                      })
                    }
                  />
                  {!row.pricingName.trim() ? (
                    <Text style={twStyle("mt-1.5 text-xs text-gray-500")}>
                      {po("leaveBlank", { name: previewName })}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {showPriceType ? (
                <View>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("priceType")}</Text>
                  <TouchableOpacity
                    style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-3 py-3")}
                    onPress={() => setPicker({ rowId: row.id, field: "priceType" })}
                  >
                    <Text style={twStyle("text-base text-gray-900")}>{priceTypeLabel(row.priceType)}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setExpandedPriceType((prev) => ({ ...prev, [row.id]: true }))}
                  style={twStyle("flex-row items-center py-1")}
                  accessibilityRole="button"
                  accessibilityLabel={po("showPriceTypeA11y")}
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-600")}>{po("priceTypeAdvanced")}</Text>
                  <Ionicons name="chevron-down" size={16} color="#4f46e5" style={{ marginStart: 4 }} />
                </TouchableOpacity>
              )}

              {index === 0 && onOpenAdvancedPricing ? (
                <TouchableOpacity
                  style={twStyle("flex-row items-center pt-1")}
                  onPress={onOpenAdvancedPricing}
                  accessibilityRole="button"
                  accessibilityLabel={po("advancedPricingA11y")}
                >
                  <Ionicons name="options-outline" size={16} color="#4f46e5" />
                  <Text style={twStyle("ms-1.5 text-sm font-semibold text-indigo-600")}>
                    {po("advancedPricing")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}

      {allowMultipleTiers && multiTier ? (
        <TouchableOpacity
          style={twStyle(
            "flex-row items-center justify-center rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/40 py-3.5",
          )}
          onPress={addRow}
          accessibilityRole="button"
          accessibilityLabel={po("addOptionA11y")}
        >
          <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
          <Text style={twStyle("ms-2 text-sm font-semibold text-indigo-700")}>{po("addAnotherOption")}</Text>
        </TouchableOpacity>
      ) : allowMultipleTiers ? (
        <TouchableOpacity
          style={twStyle("rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4")}
          onPress={addRow}
          accessibilityRole="button"
          accessibilityLabel={po("offerMultipleA11y")}
        >
          <View style={twStyle("flex-row items-start gap-3")}>
            <View style={twStyle("rounded-full bg-white p-2 border border-gray-200")}>
              <Ionicons name="layers-outline" size={20} color="#4f46e5" />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                {po("offerMultipleTitle")}
              </Text>
              <Text style={twStyle("mt-1 text-xs leading-5 text-gray-500")}>
                {po("offerMultipleBody")}
              </Text>
            </View>
            <DirectionalIcon name="chevron-forward" size={18} color="#9ca3af" />
          </View>
        </TouchableOpacity>
      ) : null}

      <OptionPickerSheet
        visible={!!picker}
        title={picker?.field === "duration" ? po("durationTitle") : po("priceTypeTitle")}
        options={pickerOptions}
        onClose={() => setPicker(null)}
        onSelect={(value) => {
          if (!picker) return;
          if (picker.field === "duration") {
            updateRow(picker.rowId, { duration: parseInt(value, 10) || 60 });
          } else {
            updateRow(picker.rowId, { priceType: value });
          }
        }}
      />
    </View>
  );
}
