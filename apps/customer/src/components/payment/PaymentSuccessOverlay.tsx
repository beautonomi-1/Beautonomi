import { type ComponentProps } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { formatMoney } from "@beautonomi/utils";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface PaymentSuccessSummaryRow {
  icon: IoniconName;
  label: string;
  value: string;
  /** Press-and-hold to copy (e.g. gift card codes). */
  valueSelectable?: boolean;
}

export interface PaymentSuccessOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  status?: "success" | "pending" | "processing";
  summaryRows?: PaymentSuccessSummaryRow[];
  amountPaid?: number;
  currency?: string;
  /** Called when user taps Continue */
  onDismiss: () => void;
  /** Footer line under summary (e.g. "Taking you to your orders…") */
  footerHint?: string;
}

/**
 * Reusable success / pending sheet matching booking checkout overlay styling.
 */
export function PaymentSuccessOverlay({
  visible,
  title,
  subtitle,
  status = "success",
  summaryRows,
  amountPaid,
  currency,
  onDismiss,
  footerHint,
}: PaymentSuccessOverlayProps) {
  const { t } = useTranslation();
  const isWaiting = status === "pending" || status === "processing";
  const iconName = isWaiting ? "time-outline" : "checkmark-circle";
  const iconColor = isWaiting ? "#F59E0B" : Colors.primary;
  const bgColor = isWaiting ? "#FEF3C7" : `${Colors.primary}12`;
  const borderColor = isWaiting ? "#FCD34D" : `${Colors.primary}30`;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.scrim} pointerEvents="box-only">
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: bgColor, borderColor }]}>
            <Ionicons name={iconName} size={52} color={iconColor} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, isWaiting && styles.subtitlePending]}>{subtitle}</Text>
          ) : null}
          {summaryRows && summaryRows.length > 0 ? (
            <View style={styles.summary}>
              {summaryRows.map((row, i) => (
                <View key={`${row.label}-${i}`} style={styles.summaryRow}>
                  <View style={styles.summaryIcon}>
                    <Ionicons name={row.icon} size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>{row.label}</Text>
                    <Text style={styles.summaryValue} selectable={row.valueSelectable}>{row.value}</Text>
                  </View>
                </View>
              ))}
              {amountPaid != null && amountPaid > 0 && currency ? (
                <Text style={styles.amountLine}>
                  {t("checkout.totalPaidPrefix", { defaultValue: "Total paid" })}{" "}
                  {formatMoney(amountPaid, currency)}
                </Text>
              ) : null}
            </View>
          ) : amountPaid != null && amountPaid > 0 && currency ? (
            <Text style={styles.amountStandalone}>
              {t("checkout.totalPaidPrefix", { defaultValue: "Total paid" })}{" "}
              {formatMoney(amountPaid, currency)}
            </Text>
          ) : null}
          {footerHint ? <Text style={styles.footer}>{footerHint}</Text> : null}
          <TouchableOpacity
            style={styles.cta}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t("common.continue", { defaultValue: "Continue" })}
          >
            <Text style={styles.ctaText}>{t("common.continue", { defaultValue: "Continue" })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  subtitlePending: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
  },
  summary: {
    width: "100%",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${Colors.primary}12`,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginTop: 2,
  },
  amountLine: {
    fontSize: 12,
    color: "#4b5563",
    textAlign: "center",
    marginTop: 4,
  },
  amountStandalone: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  footer: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  cta: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
});
