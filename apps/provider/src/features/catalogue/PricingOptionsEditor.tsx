import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import { useState } from "react";
import type { PricingOption, RefDataOption } from "./types";
import { DEFAULT_PRICING_OPTION } from "./types";

interface PricingOptionsEditorProps {
  options: PricingOption[];
  onChange: (options: PricingOption[]) => void;
  durationOptions: RefDataOption[];
  priceTypeOptions: RefDataOption[];
  onOpenAdvancedPricing?: () => void;
  currencyLabel?: string;
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

export function PricingOptionsEditor({
  options,
  onChange,
  durationOptions,
  priceTypeOptions,
  onOpenAdvancedPricing,
}: PricingOptionsEditorProps) {
  const [picker, setPicker] = useState<{
    rowId: string;
    field: "duration" | "priceType";
  } | null>(null);

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

  return (
    <View style={twStyle("mb-4")}>
      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Duration & pricing</Text>
      {options.map((row, index) => (
        <View
          key={row.id}
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}
        >
          {options.length > 1 ? (
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Text style={twStyle("text-xs font-medium text-gray-500")}>
                Option {index + 1}
                {index === 0 ? " (primary)" : ""}
              </Text>
              <TouchableOpacity onPress={() => removeRow(row.id)} accessibilityLabel="Remove pricing option">
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Duration *</Text>
          <TouchableOpacity
            style={twStyle("mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5")}
            onPress={() => setPicker({ rowId: row.id, field: "duration" })}
          >
            <Text style={twStyle("text-base text-gray-900")}>
              {durationOptions.find((d) => d.value === String(row.duration))?.label ??
                `${row.duration} min`}
            </Text>
          </TouchableOpacity>

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Price type</Text>
          <TouchableOpacity
            style={twStyle("mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5")}
            onPress={() => setPicker({ rowId: row.id, field: "priceType" })}
          >
            <Text style={twStyle("text-base text-gray-900")}>
              {priceTypeOptions.find((p) => p.value === row.priceType)?.label ?? row.priceType}
            </Text>
          </TouchableOpacity>

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Price *</Text>
          <TextInput
            style={twStyle("mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900")}
            value={String(row.price)}
            onChangeText={(t) => updateRow(row.id, { price: parseFloat(t) || 0 })}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Pricing name</Text>
          <TextInput
            style={twStyle("rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900")}
            value={row.pricingName}
            onChangeText={(t) => updateRow(row.id, { pricingName: t })}
            placeholder="e.g. Standard, Express (creates variant when set)"
          />

          {index === 0 && onOpenAdvancedPricing ? (
            <TouchableOpacity
              style={twStyle("mt-3")}
              onPress={onOpenAdvancedPricing}
            >
              <Text style={twStyle("text-sm font-semibold text-indigo-600")}>Advanced pricing rules</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      <TouchableOpacity
        style={twStyle("flex-row items-center justify-center rounded-xl border border-dashed border-indigo-300 py-3")}
        onPress={addRow}
      >
        <Ionicons name="add" size={18} color="#4f46e5" />
        <Text style={twStyle("ml-1 text-sm font-medium text-indigo-600")}>Add pricing option</Text>
      </TouchableOpacity>

      <OptionPickerSheet
        visible={!!picker}
        title={picker?.field === "duration" ? "Duration" : "Price type"}
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
