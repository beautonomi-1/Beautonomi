import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { useImagePicker } from "@/hooks/useImagePicker";
import type { ProductVariantRow, VariantOptionType } from "./types";
import { generateVariantMatrixRows } from "./variantMatrix";
import { computeMarkupFromPrices, computeRetailFromMarkup } from "./markupCalc";
import { BarcodeScannerModal } from "./BarcodeScannerModal";

type Props = {
  variantOptionTypes: VariantOptionType[];
  variantRows: ProductVariantRow[];
  defaultMeasure: string;
  onChangeOptionTypes: (types: VariantOptionType[]) => void;
  onChangeRows: (rows: ProductVariantRow[]) => void;
};

export function VariantMatrixEditor({
  variantOptionTypes,
  variantRows,
  defaultMeasure,
  onChangeOptionTypes,
  onChangeRows,
}: Props) {
  const { t } = useTranslation();
  const vm = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.components.variantMatrixEditor.${key}`, opts) as string,
    [t],
  );
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [barcodeScanRowIndex, setBarcodeScanRowIndex] = useState<number | null>(null);
  const { pickFromLibrary } = useImagePicker();

  const uploadVariantImage = useCallback(async (rowIndex: number, asset: { uri: string; mimeType?: string | null; fileName?: string | null }) => {
    setUploadingIndex(rowIndex);
    try {
      const formData = new FormData();
      const name = asset.fileName || `variant-${rowIndex}-${Date.now()}.jpg`;
      appendFormDataFileNative(formData, "file", { uri: asset.uri, type: asset.mimeType || "image/jpeg", name });
      formData.append("folder", "products");
      const res = await api.fetch<{ url?: string }>("/api/upload", { method: "POST", body: formData });
      if (res.error || !res.data?.url) {
        Alert.alert(vm("uploadFailedTitle"), res.error?.message ?? vm("uploadFailedBody"));
        return;
      }
      const next = [...variantRows];
      if (next[rowIndex]) {
        next[rowIndex] = { ...next[rowIndex], image_url: res.data.url };
        onChangeRows(next);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setUploadingIndex(null);
    }
  }, [onChangeRows, variantRows]);

  const pickVariantImage = useCallback(async (rowIndex: number) => {
    const picked = await pickFromLibrary({ aspect: [1, 1], allowsEditing: true, quality: 0.8 });
    if (!picked) return;
    await uploadVariantImage(rowIndex, picked);
  }, [pickFromLibrary, uploadVariantImage]);

  const updateRow = (idx: number, patch: Partial<ProductVariantRow>) => {
    const next = [...variantRows];
    next[idx] = { ...next[idx], ...patch };
    onChangeRows(next);
  };

  const handleGenerate = () => {
    const rows = generateVariantMatrixRows(variantOptionTypes, variantRows, { measure: defaultMeasure });
    if (rows.length === 0) {
      Alert.alert(vm("variantsTitle"), vm("addOptionRequired"));
      return;
    }
    onChangeRows(rows);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={twStyle("mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-800")}>{vm("variantOptions")}</Text>
      <Text style={twStyle("mb-3 text-xs text-gray-600")}>
        {vm("hint")}
      </Text>

      {variantOptionTypes.map((opt, oi) => (
        <View key={oi} style={twStyle("mb-3 rounded-lg border border-violet-100 bg-white p-3")}>
          <View style={twStyle("mb-2 flex-row items-center justify-between")}>
            <Text style={twStyle("text-xs font-medium text-gray-700")}>{vm("optionN", { n: oi + 1 })}</Text>
            {variantOptionTypes.length > 1 ? (
              <TouchableOpacity
                onPress={() => onChangeOptionTypes(variantOptionTypes.filter((_, i) => i !== oi))}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-xs font-medium text-red-600")}>{vm("remove")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
            style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base")}
            value={opt.name}
            onChangeText={(t) => {
              const next = [...variantOptionTypes];
              next[oi] = { ...next[oi], name: t };
              onChangeOptionTypes(next);
            }}
            placeholder={vm("placeholderSize")}
          />
          <ChipCombobox
            value={opt.values}
            onChange={(arr) => {
              const next = [...variantOptionTypes];
              next[oi] = { ...next[oi], values: arr };
              onChangeOptionTypes(next);
            }}
            staticSuggestions={[
              { value: "250ml", label: "250ml" },
              { value: "500ml", label: "500ml" },
              { value: "S", label: "S" },
              { value: "M", label: "M" },
              { value: "L", label: "L" },
            ]}
            placeholder={vm("pickOrType")}
            accessibilityLabel={vm("optionValuesA11y", { n: oi + 1 })}
          />
        </View>
      ))}

      <TouchableOpacity
        onPress={() => onChangeOptionTypes([...variantOptionTypes, { name: "", values: [] }])}
        style={twStyle("mb-2 flex-row items-center justify-center rounded-xl border border-dashed border-violet-300 py-2")}
      >
        <Ionicons name="add-circle-outline" size={18} color="#7c3aed" />
        <Text style={twStyle("ms-1 text-sm font-medium text-violet-700")}>{vm("addOption")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleGenerate}
        style={twStyle("items-center rounded-xl border border-violet-300 bg-white py-3")}
      >
        <Text style={twStyle("font-medium text-violet-700")}>{vm("generate")}</Text>
      </TouchableOpacity>

      {variantRows.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mt-3")}>
          {variantRows.map((row, idx) => (
            <View key={idx} style={twStyle("me-3 w-72 rounded-lg border border-violet-100 bg-white p-3")}>
              <Text style={twStyle("mb-2 text-xs font-medium text-gray-800")}>
                {Object.entries(row.option_values).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </Text>
              <View style={twStyle("mb-2 flex-row items-center")}>
                {row.image_url ? (
                  <Image source={{ uri: row.image_url }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="contain" />
                ) : (
                  <View style={twStyle("h-12 w-12 items-center justify-center rounded-lg border border-dashed border-violet-200")}>
                    <Ionicons name="image-outline" size={20} color="#9ca3af" />
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => pickVariantImage(idx)}
                  disabled={uploadingIndex === idx}
                  style={twStyle("ms-2 rounded-lg border border-violet-200 px-2 py-1")}
                >
                  {uploadingIndex === idx ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text style={twStyle("text-xs text-violet-700")}>{row.image_url ? vm("replace") : vm("photo")}</Text>
                  )}
                </TouchableOpacity>
              </View>
              {(["sku", "barcode", "measure"] as const).map((field) => (
                <View key={field} style={twStyle("mb-1")}>
                  <View style={twStyle("flex-row items-center justify-between")}>
                    <Text style={twStyle("text-[10px] uppercase text-gray-500")}>{vm(field === "sku" ? "fieldSku" : field === "barcode" ? "fieldBarcode" : "fieldMeasure")}</Text>
                    {field === "barcode" ? (
                      <TouchableOpacity
                        onPress={() => setBarcodeScanRowIndex(idx)}
                        style={twStyle("flex-row items-center py-0.5")}
                        accessibilityLabel={vm("scanBarcodeA11y", { n: idx + 1 })}
                        accessibilityRole="button"
                      >
                        <Ionicons name="barcode-outline" size={14} color="#7c3aed" />
                        <Text style={twStyle("ms-0.5 text-[10px] font-medium text-violet-700")}>{vm("scan")}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TextInput
                    style={twStyle("rounded border border-gray-200 px-2 py-1 text-sm")}
                    keyboardType={field === "measure" ? "default" : undefined}
                    value={String(row[field] ?? "")}
                    onChangeText={(t) => {
                      if (field === "measure") {
                        updateRow(idx, { measure: t });
                        return;
                      }
                      updateRow(idx, { [field]: t });
                    }}
                  />
                </View>
              ))}
              {(["amount", "quantity", "low_stock_level", "reorder_quantity", "supply_price", "retail_price", "markup"] as const).map((field) => (
                <View key={field} style={twStyle("mb-1")}>
                  <Text style={twStyle("text-[10px] uppercase text-gray-500")}>{({
                    amount: vm("fieldAmount"),
                    quantity: vm("fieldQuantity"),
                    low_stock_level: vm("fieldLowStockLevel"),
                    reorder_quantity: vm("fieldReorderQuantity"),
                    supply_price: vm("fieldSupplyPrice"),
                    retail_price: vm("fieldRetailPrice"),
                    markup: vm("fieldMarkup"),
                  } as Record<string, string>)[field]}</Text>
                  <TextInput
                    style={twStyle("rounded border border-gray-200 px-2 py-1 text-sm")}
                    keyboardType="decimal-pad"
                    value={String(row[field] ?? "")}
                    onChangeText={(t) => {
                      const num = parseFloat(t) || 0;
                      const patch: Partial<ProductVariantRow> = { [field]: num };
                      if (field === "supply_price" || field === "retail_price") {
                        const supply = field === "supply_price" ? num : row.supply_price;
                        const retail = field === "retail_price" ? num : row.retail_price;
                        patch.markup = computeMarkupFromPrices(supply, retail);
                      } else if (field === "markup") {
                        patch.retail_price = computeRetailFromMarkup(row.supply_price, num);
                      }
                      updateRow(idx, patch);
                    }}
                  />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <BarcodeScannerModal
        visible={barcodeScanRowIndex !== null}
        onClose={() => setBarcodeScanRowIndex(null)}
        title={vm("scanTitle")}
        onScanned={(code) => {
          if (barcodeScanRowIndex !== null) {
            updateRow(barcodeScanRowIndex, { barcode: code });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          setBarcodeScanRowIndex(null);
        }}
      />
    </View>
  );
}
