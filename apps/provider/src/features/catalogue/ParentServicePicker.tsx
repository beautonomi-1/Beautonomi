import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import { useState } from "react";
import type { CatalogueServiceItem } from "./types";

interface ParentServicePickerProps {
  parentServiceId: string;
  variantName: string;
  variantSortOrder: number;
  services: CatalogueServiceItem[];
  currentServiceId?: string;
  onChangeParent: (id: string) => void;
  onChangeVariantName: (name: string) => void;
  onChangeSortOrder: (order: number) => void;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      <TouchableOpacity style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
        <TextInputInner
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
        />
      </TouchableOpacity>
    </View>
  );
}

function TextInputInner(props: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <TextInput
      style={twStyle("text-base text-gray-900")}
      placeholderTextColor="#9ca3af"
      {...props}
    />
  );
}

export function ParentServicePicker({
  parentServiceId,
  variantName,
  variantSortOrder,
  services,
  currentServiceId,
  onChangeParent,
  onChangeVariantName,
  onChangeSortOrder,
}: ParentServicePickerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const parentOptions = services.filter(
    (s) =>
      s.service_type === "basic" &&
      !s.parent_service_id &&
      s.id !== currentServiceId,
  );

  const selectedLabel =
    parentOptions.find((s) => s.id === parentServiceId)?.title ??
    parentOptions.find((s) => s.id === parentServiceId)?.name ??
    "Select parent service";

  return (
    <View style={twStyle("mb-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3")}>
      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Variant settings</Text>

      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Parent service *</Text>
      <TouchableOpacity
        style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3")}
        onPress={() => setSheetOpen(true)}
      >
        <Text style={twStyle("text-base text-gray-900")}>{selectedLabel}</Text>
      </TouchableOpacity>

      <FormField
        label="Variant name"
        value={variantName}
        onChangeText={onChangeVariantName}
        placeholder="e.g. Short, Long"
      />

      <FormField
        label="Sort order"
        value={String(variantSortOrder)}
        onChangeText={(t) => onChangeSortOrder(parseInt(t, 10) || 0)}
        placeholder="0"
        keyboardType="numeric"
      />

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Parent service">
        {parentOptions.map((svc) => (
          <TouchableOpacity
            key={svc.id}
            style={twStyle("border-b border-gray-100 py-3.5")}
            onPress={() => {
              onChangeParent(svc.id);
              setSheetOpen(false);
            }}
          >
            <Text style={twStyle("text-base text-gray-900")}>{svc.title ?? svc.name}</Text>
          </TouchableOpacity>
        ))}
        {parentOptions.length === 0 ? (
          <Text style={twStyle("py-4 text-center text-sm text-gray-500")}>
            Create a basic service first to use as parent.
          </Text>
        ) : null}
      </BottomSheet>
    </View>
  );
}
