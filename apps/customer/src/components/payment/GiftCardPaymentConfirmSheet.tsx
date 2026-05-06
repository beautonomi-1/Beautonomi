import { View, Text, Modal, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { Colors } from "@/constants/colors";
import type { SavedPaymentMethod } from "@/types/api";

export interface GiftCardPaymentConfirmSheetProps {
  visible: boolean;
  totalLabel: string;
  summaryLine: string;
  savedCards: SavedPaymentMethod[];
  defaultCard: SavedPaymentMethod | null;
  useNewCard: boolean;
  onUseNewCardChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function cardLabel(card: SavedPaymentMethod): string {
  const brand = card.card_type ? card.card_type.charAt(0).toUpperCase() + card.card_type.slice(1) : "Card";
  return card.last4 ? `${brand} •••• ${card.last4}` : brand;
}

/**
 * Pre-payment confirmation: shows amount and saved vs new card before opening Paystack or charging.
 */
export function GiftCardPaymentConfirmSheet({
  visible,
  totalLabel,
  summaryLine,
  savedCards,
  defaultCard,
  useNewCard,
  onUseNewCardChange,
  onConfirm,
  onCancel,
}: GiftCardPaymentConfirmSheetProps) {
  const hasSaved = savedCards.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.heading}>Confirm payment</Text>
          <Text style={styles.summary}>{summaryLine}</Text>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{totalLabel}</Text>
          </View>

          {hasSaved ? (
            <View style={styles.cardSection}>
              <Text style={styles.sectionTitle}>Payment method</Text>
              <TouchableOpacity
                style={[styles.option, !useNewCard && styles.optionSelected]}
                onPress={() => onUseNewCardChange(false)}
                accessibilityRole="radio"
                accessibilityState={{ selected: !useNewCard }}
              >
                <View style={[styles.radio, !useNewCard && styles.radioOn]} />
                <Text style={styles.optionText}>
                  {defaultCard ? cardLabel(defaultCard) : "Saved card"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.option, useNewCard && styles.optionSelected]}
                onPress={() => onUseNewCardChange(true)}
                accessibilityRole="radio"
                accessibilityState={{ selected: useNewCard }}
              >
                <View style={[styles.radio, useNewCard && styles.radioOn]} />
                <Text style={styles.optionText}>Pay with a new card (secure browser)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.hint}>You will complete payment in a secure browser window.</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onCancel}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={onConfirm}>
              <Text style={styles.btnPrimaryText}>Confirm & pay</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
  },
  totalBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginTop: 4,
  },
  cardSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,0,119,0.04)",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  hint: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 20,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  btnSecondaryText: {
    fontWeight: "700",
    color: "#374151",
    fontSize: 16,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  btnPrimaryText: {
    fontWeight: "800",
    color: "#fff",
    fontSize: 16,
  },
});
