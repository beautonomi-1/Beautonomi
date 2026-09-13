import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { useApiMutation } from "@/hooks/useApi";
import { twStyle } from "@/lib/twStyle";
import { STOCK_ADJUST_REASONS } from "./types";
import type { ProductItem, ProductVariantRow } from "./types";
import { variantLabel } from "./cartItem";
import { emitProviderProductsCatalogChanged } from "@/lib/provider-products-catalog-events";

type Props = {
  visible: boolean;
  product: ProductItem | null;
  onClose: () => void;
  onSuccess?: () => void;
};

const REASON_KEYS: Record<string, string> = {
  stock_count: "reasonStockCount",
  received: "reasonReceived",
  returned: "reasonReturned",
  damaged: "reasonDamaged",
  manual_in: "reasonManualIn",
  manual_out: "reasonManualOut",
};

export function StockAdjustSheet({ visible, product, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const pc = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.productsCatalog.${key}`, opts) as string;
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<string>(STOCK_ADJUST_REASONS[0].value);
  const [note, setNote] = useState("");
  const [variantId, setVariantId] = useState<string | null>(null);
  const { execute: postAdjust, loading } = useApiMutation("post");

  useEffect(() => {
    if (visible && product) {
      setDelta("");
      setNote("");
      setReason(STOCK_ADJUST_REASONS[0].value);
      const variants = product.variants ?? [];
      setVariantId(product.has_variants && variants.length === 1 ? (variants[0].id ?? null) : null);
    }
  }, [visible, product]);

  if (!product) return null;

  const variants = (product.variants ?? []).filter((v) => v.id) as (ProductVariantRow & { id: string })[];
  const hasVariants = Boolean(product.has_variants && variants.length > 0);

  const handleSubmit = async () => {
    const parsed = parseInt(delta, 10);
    if (!parsed || Number.isNaN(parsed) || parsed === 0) {
      Alert.alert(pc("validationTitle"), pc("stockDeltaRequired"));
      return;
    }
    if (hasVariants && !variantId) {
      Alert.alert(pc("selectVariantTitle"), pc("selectVariantBody"));
      return;
    }

    const { error } = await postAdjust(`/api/provider/products/${product.id}/stock-movements`, {
      delta: parsed,
      reason,
      note: note.trim() || undefined,
      product_variant_id: variantId ?? undefined,
    });
    if (error) {
      Alert.alert(pc("errorTitle"), error);
      return;
    }
    emitProviderProductsCatalogChanged();
    onSuccess?.();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={pc("adjustStock")}>
      <Text style={twStyle("mb-3 text-sm text-gray-600")}>{product.name}</Text>

      {hasVariants && (
        <View style={twStyle("mb-3")}>
          <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>{pc("variant")}</Text>
          {variants.map((v) => (
            <TouchableOpacity
              key={v.id}
              onPress={() => setVariantId(v.id!)}
              style={[
                twStyle("mb-1 rounded-lg border px-3 py-2"),
                variantId === v.id ? twStyle("border-indigo-500 bg-indigo-50") : twStyle("border-gray-200 bg-white"),
              ]}
            >
              <Text style={twStyle("text-sm text-gray-800")}>
                {pc("variantQty", { label: variantLabel(v), count: v.quantity ?? 0 })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>{pc("quantityChange")}</Text>
      <TextInput
        style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base")}
        placeholder={pc("quantityChangePlaceholder")}
        keyboardType="numbers-and-punctuation"
        value={delta}
        onChangeText={setDelta}
      />

      <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>{pc("reason")}</Text>
      <View style={twStyle("mb-3 flex-row flex-wrap gap-2")}>
        {STOCK_ADJUST_REASONS.map((r) => (
          <TouchableOpacity
            key={r.value}
            onPress={() => setReason(r.value)}
            style={[
              twStyle("rounded-full border px-3 py-1.5"),
              reason === r.value ? twStyle("border-indigo-500 bg-indigo-50") : twStyle("border-gray-200"),
            ]}
          >
            <Text style={[twStyle("text-xs"), reason === r.value ? twStyle("text-indigo-700 font-medium") : twStyle("text-gray-600")]}>
              {pc(REASON_KEYS[r.value] ?? "reason")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>{pc("noteOptional")}</Text>
      <TextInput
        style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base")}
        placeholder={pc("notePlaceholder")}
        value={note}
        onChangeText={setNote}
        multiline
      />

      <ActionButton label={loading ? pc("saving") : pc("saveAdjustment")} onPress={handleSubmit} disabled={loading} />
      {loading && <ActivityIndicator style={twStyle("mt-2")} />}
    </BottomSheet>
  );
}
