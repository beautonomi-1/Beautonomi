import { View, Text, ScrollView, TouchableOpacity, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import type { SelectedCheckoutProduct } from "@/lib/booking-checkout-products";

type SelectedProductChipsProps = {
  items: SelectedCheckoutProduct[];
  formatCurrency: (amount: number, currency?: string) => string;
  onEdit: (productId: string, variantId: string | null | undefined) => void;
  onRemove: (productId: string, variantId: string | null | undefined) => void;
  editLabel: (name: string, count: number) => string;
  removeLabel: (name: string) => string;
};

export function SelectedProductChips({
  items,
  formatCurrency,
  onEdit,
  onRemove,
  editLabel,
  removeLabel,
}: SelectedProductChipsProps) {
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
      style={{ marginBottom: 10 }}
    >
      {items.map((item) => {
        const key = `${item.productId}-${item.productVariantId ?? "base"}`;
        return (
          <View
            key={key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              maxWidth: 220,
              paddingLeft: 12,
              paddingRight: 6,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: Colors.primaryLight,
              borderWidth: 1,
              borderColor: `${Colors.primary}33`,
            }}
          >
            <Pressable
              onPress={() => onEdit(item.productId, item.productVariantId)}
              style={{ flex: 1, minWidth: 0, marginRight: 4 }}
              accessibilityRole="button"
              accessibilityLabel={editLabel(item.name, item.quantity)}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>
                ×{item.quantity} · {formatCurrency(item.price * item.quantity, item.currency)}
              </Text>
            </Pressable>
            <TouchableOpacity
              onPress={() => onRemove(item.productId, item.productVariantId)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                minWidth: 32,
                minHeight: 32,
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel={removeLabel(item.name)}
            >
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}
