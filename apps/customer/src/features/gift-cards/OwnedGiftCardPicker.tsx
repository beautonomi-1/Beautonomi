import { Platform, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";
import type { GiftCardListRow } from "@/features/gift-cards/filter-usable-gift-cards";

type Props = {
  cards: GiftCardListRow[];
  disabled?: boolean;
  formatCurrency: (amount: number, currency: string) => string;
  onSelect: (code: string) => void;
};

export function OwnedGiftCardPicker({ cards, disabled, formatCurrency, onSelect }: Props) {
  const { t } = useTranslation();
  if (cards.length === 0) return null;

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
        {t("checkout.yourGiftCredit")}
      </Text>
      {cards.map((gc) => (
        <TouchableOpacity
          key={gc.id}
          onPress={() => onSelect(gc.code!.trim().toUpperCase())}
          disabled={disabled}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 10,
            paddingHorizontal: 12,
            marginBottom: 8,
            backgroundColor: "#FFF",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            opacity: disabled ? 0.6 : 1,
          }}
          accessibilityRole="button"
          accessibilityLabel={`${t("checkout.apply")} ${gc.code}`}
        >
          <Text
            style={{
              flex: 1,
              marginEnd: 10,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 13,
              color: "#111827",
            }}
            selectable
          >
            {gc.code}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>
            {formatCurrency(Number(gc.balance ?? 0), gc.currency || "")} · {t("checkout.apply")}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
