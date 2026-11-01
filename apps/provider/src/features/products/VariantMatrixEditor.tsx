import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import { appendUploadFile } from "@/lib/form-data-file";
import { useImagePicker } from "@/hooks/useImagePicker";
import type { ProductVariantRow, VariantOptionType } from "./types";
import { generateVariantMatrixRows, optionValuesKey } from "./variantMatrix";
import { computeMarkupFromPrices, computeRetailFromMarkup } from "./markupCalc";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { variantRowShouldOpenDetailsInitially } from "./productVariantFormHelpers";

type Props = {
  variantOptionTypes: VariantOptionType[];
  variantRows: ProductVariantRow[];
  defaultMeasure: string;
  defaultMeasureLabel: string;
  onOpenDefaultMeasure: () => void;
  onChangeOptionTypes: (types: VariantOptionType[]) => void;
  onChangeRows: (rows: ProductVariantRow[]) => void;
};

function optionLabel(row: ProductVariantRow): string {
  return Object.entries(row.option_values)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export function VariantMatrixEditor({
  variantOptionTypes,
  variantRows,
  defaultMeasure,
  defaultMeasureLabel,
  onOpenDefaultMeasure,
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
  const detailsOpenByKey = useRef<Map<string, boolean>>(new Map());
  const [, bumpDetailsUi] = useState(0);

  useEffect(() => {
    for (const row of variantRows) {
      const key = optionValuesKey(row.option_values);
      if (!key || detailsOpenByKey.current.has(key)) continue;
      detailsOpenByKey.current.set(
        key,
        variantRowShouldOpenDetailsInitially(row, defaultMeasure),
      );
    }
  }, [variantRows, defaultMeasure]);

  const isDetailsOpen = (row: ProductVariantRow) => {
    const key = optionValuesKey(row.option_values);
    if (!key) return false;
    return detailsOpenByKey.current.get(key) ?? false;
  };

  const setDetailsOpen = (row: ProductVariantRow, open: boolean) => {
    const key = optionValuesKey(row.option_values);
    if (!key) return;
    detailsOpenByKey.current.set(key, open);
    bumpDetailsUi((v) => v + 1);
  };

  const uploadVariantImage = useCallback(
    async (
      rowIndex: number,
      asset: { uri: string; mimeType?: string | null; fileName?: string | null },
    ) => {
      setUploadingIndex(rowIndex);
      try {
        const formData = new FormData();
        const name = asset.fileName || `variant-${rowIndex}-${Date.now()}.jpg`;
        await appendUploadFile(formData, "file", {
          uri: asset.uri,
          type: asset.mimeType || "image/jpeg",
          name,
        });
        formData.append("folder", "products");
        const res = await api.fetch<{ url?: string }>("/api/upload", {
          method: "POST",
          body: formData,
        });
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
    },
    [onChangeRows, variantRows, vm],
  );

  const pickVariantImage = useCallback(
    async (rowIndex: number) => {
      const picked = await pickFromLibrary({ aspect: [1, 1], allowsEditing: true, quality: 0.8 });
      if (!picked) return;
      await uploadVariantImage(rowIndex, picked);
    },
    [pickFromLibrary, uploadVariantImage],
  );

  const updateRow = (idx: number, patch: Partial<ProductVariantRow>) => {
    const next = [...variantRows];
    next[idx] = { ...next[idx], ...patch };
    onChangeRows(next);
  };

  const handleGenerate = () => {
    const rows = generateVariantMatrixRows(variantOptionTypes, variantRows, {
      measure: defaultMeasure,
    });
    if (rows.length === 0) {
      Alert.alert(vm("variantsTitle"), vm("addOptionRequired"));
      return;
    }
    onChangeRows(rows);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderSkuBarcodeSummary = (row: ProductVariantRow) => {
    const parts: string[] = [];
    if (row.sku?.trim()) parts.push(`${vm("fieldSkuLabel")}: ${row.sku.trim()}`);
    if (row.barcode?.trim()) parts.push(`${vm("fieldBarcodeLabel")}: ${row.barcode.trim()}`);
    if (parts.length === 0) return null;
    return (
      <Text style={twStyle("mt-1 text-xs text-gray-500")} numberOfLines={2}>
        {parts.join(" · ")}
      </Text>
    );
  };

  return (
    <View style={twStyle("mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-800")}>{vm("variantOptions")}</Text>
      <Text style={twStyle("mb-3 text-xs text-gray-600")}>{vm("hint")}</Text>

      <View style={twStyle("mb-3")}>
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{vm("defaultMeasureLabel")}</Text>
        <Text style={twStyle("mb-2 text-xs text-gray-500")}>{vm("defaultMeasureHint")}</Text>
        <TouchableOpacity
          style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3")}
          onPress={onOpenDefaultMeasure}
          accessibilityRole="button"
          accessibilityLabel={vm("defaultMeasureA11y", { value: defaultMeasureLabel })}
        >
          <Text style={twStyle("text-base text-gray-900")}>{defaultMeasureLabel}</Text>
        </TouchableOpacity>
      </View>

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
            onChangeText={(text) => {
              const next = [...variantOptionTypes];
              next[oi] = { ...next[oi], name: text };
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
        accessibilityRole="button"
        accessibilityLabel={vm("createOptionsA11y")}
      >
        <Text style={twStyle("font-medium text-violet-700")}>{vm("createOptions")}</Text>
      </TouchableOpacity>

      {variantRows.length > 0 ? (
        <View style={twStyle("mt-3 gap-3")}>
          {variantRows.map((row, idx) => {
            const label = optionLabel(row);
            const detailsOpen = isDetailsOpen(row);
            return (
              <View
                key={optionValuesKey(row.option_values) || String(idx)}
                style={twStyle("rounded-lg border border-violet-100 bg-white p-3")}
              >
                <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>{label}</Text>
                <View style={twStyle("mb-2 flex-row gap-3")}>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>
                      {vm("fieldRetailPriceLabel")}
                    </Text>
                    <TextInput
                      style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base")}
                      keyboardType="decimal-pad"
                      value={row.retail_price > 0 ? String(row.retail_price) : ""}
                      onChangeText={(text) => {
                        const num = parseFloat(text) || 0;
                        const supply = row.supply_price;
                        updateRow(idx, {
                          retail_price: num,
                          markup: computeMarkupFromPrices(supply, num),
                        });
                      }}
                      placeholder="0.00"
                      accessibilityLabel={vm("retailPriceA11y", { name: label })}
                    />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>
                      {vm("fieldQuantityLabel")}
                    </Text>
                    <TextInput
                      style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base")}
                      keyboardType="decimal-pad"
                      value={String(row.quantity ?? "")}
                      onChangeText={(text) => updateRow(idx, { quantity: parseFloat(text) || 0 })}
                      placeholder="0"
                    />
                  </View>
                </View>
                {renderSkuBarcodeSummary(row)}
                <TouchableOpacity
                  onPress={() => setDetailsOpen(row, !detailsOpen)}
                  style={twStyle("mt-2 flex-row items-center py-1")}
                  accessibilityRole="button"
                  accessibilityLabel={
                    detailsOpen ? vm("hideDetailsA11y", { name: label }) : vm("moreDetailsA11y", { name: label })
                  }
                >
                  <Text style={twStyle("text-sm font-medium text-violet-700")}>
                    {detailsOpen ? vm("hideDetails") : vm("moreDetails")}
                  </Text>
                  <Ionicons
                    name={detailsOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#7c3aed"
                    style={{ marginStart: 4 }}
                  />
                </TouchableOpacity>
                {detailsOpen ? (
                  <View style={twStyle("mt-2 gap-2 border-t border-gray-100 pt-2")}>
                    <View style={twStyle("flex-row items-center")}>
                      {row.image_url ? (
                        <Image
                          source={{ uri: row.image_url }}
                          style={{ width: 48, height: 48, borderRadius: 8 }}
                          contentFit="contain"
                        />
                      ) : (
                        <View
                          style={twStyle(
                            "h-12 w-12 items-center justify-center rounded-lg border border-dashed border-violet-200",
                          )}
                        >
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
                          <Text style={twStyle("text-xs text-violet-700")}>
                            {row.image_url ? vm("replace") : vm("photo")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    {(
                      [
                        { field: "sku" as const, label: vm("fieldSkuLabel"), keyboard: "default" as const },
                        { field: "barcode" as const, label: vm("fieldBarcodeLabel"), keyboard: "default" as const },
                        { field: "measure" as const, label: vm("fieldMeasureLabel"), keyboard: "default" as const },
                        { field: "amount" as const, label: vm("fieldAmountLabel"), keyboard: "decimal-pad" as const },
                        {
                          field: "low_stock_level" as const,
                          label: vm("fieldLowStockLevelLabel"),
                          keyboard: "decimal-pad" as const,
                        },
                        {
                          field: "reorder_quantity" as const,
                          label: vm("fieldReorderQuantityLabel"),
                          keyboard: "decimal-pad" as const,
                        },
                        {
                          field: "supply_price" as const,
                          label: vm("fieldSupplyPriceLabel"),
                          keyboard: "decimal-pad" as const,
                        },
                        {
                          field: "markup" as const,
                          label: vm("fieldMarkupLabel"),
                          keyboard: "decimal-pad" as const,
                        },
                      ] as const
                    ).map(({ field, label: fieldLabel, keyboard }) => (
                      <View key={field}>
                        <View style={twStyle("flex-row items-center justify-between")}>
                          <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>{fieldLabel}</Text>
                          {field === "barcode" ? (
                            <TouchableOpacity
                              onPress={() => setBarcodeScanRowIndex(idx)}
                              style={twStyle("flex-row items-center py-0.5")}
                              accessibilityLabel={vm("scanBarcodeA11y", { n: idx + 1 })}
                              accessibilityRole="button"
                            >
                              <Ionicons name="barcode-outline" size={14} color="#7c3aed" />
                              <Text style={twStyle("ms-0.5 text-[10px] font-medium text-violet-700")}>
                                {vm("scan")}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        <TextInput
                          style={twStyle("rounded border border-gray-200 px-2 py-2 text-sm")}
                          keyboardType={keyboard}
                          value={
                            field === "sku" || field === "barcode" || field === "measure"
                              ? String(row[field] ?? "")
                              : String(row[field] ?? "")
                          }
                          onChangeText={(text) => {
                            if (field === "sku" || field === "barcode" || field === "measure") {
                              updateRow(idx, { [field]: text });
                              return;
                            }
                            const num = parseFloat(text) || 0;
                            const patch: Partial<ProductVariantRow> = { [field]: num };
                            if (field === "supply_price") {
                              patch.markup = computeMarkupFromPrices(num, row.retail_price);
                            } else if (field === "markup") {
                              patch.retail_price = computeRetailFromMarkup(row.supply_price, num);
                            }
                            updateRow(idx, patch);
                          }}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

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
