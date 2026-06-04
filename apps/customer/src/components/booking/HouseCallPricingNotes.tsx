import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  computeAtHomeLinePrice,
  hasAtHomePriceAdjustment,
  houseCallAdjustmentForSnapshotLine,
  lineHasHouseCallAdjustment,
  sumHouseCallAdjustmentsFromSnapshot,
  type AtHomeSnapshotLine,
} from "@beautonomi/utils";
import { formatMoney } from "@beautonomi/utils";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
  defaultValue?: string
) => string;

const emerald = {
  bg: "#ECFDF5",
  border: "#A7F3D0",
  text: "#065F46",
  muted: "#047857",
};

export function HouseCallAtHomeBanner({ t, show = true }: { t: TranslateFn; show?: boolean }) {
  if (!show) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="home-outline" size={18} color={emerald.muted} style={{ marginRight: 10 }} />
      <Text style={styles.bannerText}>{t("booking.houseCallPricing.atHomePricesHint")}</Text>
    </View>
  );
}

export function HouseCallLineFootnote({
  line,
  currency,
  t,
}: {
  line: AtHomeSnapshotLine;
  currency: string;
  t: TranslateFn;
}) {
  if (!lineHasHouseCallAdjustment(line)) return null;
  const amount = houseCallAdjustmentForSnapshotLine(line);
  if (amount <= 0) return null;
  return (
    <Text style={styles.lineFootnote}>
      {t("booking.houseCallPricing.includesHouseCallFee", {
        currency,
        amount: amount.toFixed(2),
      })}
    </Text>
  );
}

export function HouseCallFeesSummaryCard({
  lines,
  currency,
  t,
}: {
  lines: AtHomeSnapshotLine[];
  currency: string;
  t: TranslateFn;
}) {
  const total = sumHouseCallAdjustmentsFromSnapshot(lines);
  if (total <= 0) return null;
  const count = lines.filter((l) => lineHasHouseCallAdjustment(l)).length;
  const label =
    count > 1
      ? t("booking.houseCallPricing.houseCallFeeSummary", { count })
      : t("booking.houseCallPricing.houseCallFeeLine");

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Ionicons name="home-outline" size={16} color={emerald.muted} style={{ marginRight: 8 }} />
          <Text style={styles.summaryLabel}>{label}</Text>
        </View>
        <Text style={styles.summaryAmount}>{formatMoney(total, currency)}</Text>
      </View>
    </View>
  );
}

/** Price column for service list rows. */
export function HouseCallServicePriceText({
  basePrice,
  atHomePriceAdjustment,
  isAtHome,
  currency,
  t,
}: {
  basePrice: number;
  atHomePriceAdjustment?: number | null;
  isAtHome: boolean;
  currency: string;
  t: TranslateFn;
}) {
  const { displayPrice, adjustmentApplied } = computeAtHomeLinePrice(
    basePrice,
    atHomePriceAdjustment,
    isAtHome
  );
  const adj = Number(atHomePriceAdjustment ?? 0);

  if (!hasAtHomePriceAdjustment(adj)) {
    return (
      <View style={{ alignItems: "flex-end", maxWidth: 140 }}>
        <Text style={styles.priceMain}>{formatMoney(basePrice, currency)}</Text>
      </View>
    );
  }

  if (!isAtHome) {
    const homePrice = basePrice + adj;
    return (
      <View style={{ alignItems: "flex-end", maxWidth: 140 }}>
        <Text style={styles.priceMain}>{formatMoney(basePrice, currency)}</Text>
        <Text style={styles.priceDual} numberOfLines={2}>
          {t("booking.houseCallPricing.salonAndHomeFrom", {
            currency,
            salonPrice: basePrice.toFixed(2),
            homePrice: homePrice.toFixed(2),
          })}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "flex-end", maxWidth: 140 }}>
      <Text style={styles.priceMain}>{formatMoney(displayPrice, currency)}</Text>
      {isAtHome && (
        <Text style={styles.priceFootnote} numberOfLines={2}>
          {t("booking.houseCallPricing.includesHouseCallFee", {
            currency,
            amount: adjustmentApplied.toFixed(2),
          })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: emerald.bg,
    borderWidth: 1,
    borderColor: emerald.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: emerald.text,
  },
  lineFootnote: {
    fontSize: 11,
    color: emerald.muted,
    marginTop: 4,
    lineHeight: 15,
  },
  summaryCard: {
    backgroundColor: emerald.bg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: emerald.border,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: emerald.text,
    flex: 1,
  },
  summaryAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: emerald.text,
  },
  priceMain: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  priceDual: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
    textAlign: "right",
  },
  priceFootnote: {
    fontSize: 10,
    color: emerald.muted,
    marginTop: 2,
    textAlign: "right",
  },
});
