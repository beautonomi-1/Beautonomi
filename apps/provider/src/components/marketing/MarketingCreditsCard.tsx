/**
 * Marketing credit balance card for the provider mobile Campaigns screen.
 *
 * Presentational only — balance/spend data and the top-up action are owned by
 * the parent screen via {@link useMarketingCredits}, so the same state drives
 * both this card and the pre-send cost confirmation.
 */
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import type { MarketingStatus, MarketingLedgerResponse } from "@/lib/marketing/useMarketingCredits";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";

function formatZar(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return formatMoney(n, "ZAR");
}

interface Props {
  status: MarketingStatus | null;
  ledger: MarketingLedgerResponse | null;
  loading: boolean;
  creditsApply: boolean;
  onTopUp?: () => void;
}

export function MarketingCreditsCard({ status, ledger, loading, creditsApply, onTopUp }: Props) {
  const { t } = useTranslation();
  const mc = (key: string, opts?: Record<string, unknown>) => t(`provider.mobile.components.marketingCredits.${key}`, opts) as string;
  if (loading && !status) {
    return (
      <View style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!status || !status.marketing_enabled) return null;

  // Provider sends through their own SendGrid/Twilio — platform doesn't charge credits.
  if (!creditsApply) {
    const detail =
      status.sending_mode && status.sending_mode !== "platform"
        ? mc("ownIntegrationsDetail")
        : mc("connectOrUpgrade");
    return (
      <View style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.gray[500]} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{mc("ownSendingTitle")}</Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: Colors.gray[600] }}>{detail}</Text>
        </View>
      </View>
    );
  }

  const balance = status.balance?.total_zar ?? 0;
  const included = status.balance?.included_balance_zar ?? 0;
  const purchased = status.balance?.purchased_balance_zar ?? 0;
  const spent = ledger?.summary?.spent ?? 0;
  const low = balance < 5;

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: low ? "#fca5a5" : Colors.gray[200],
        backgroundColor: low ? "#fef2f2" : Colors.white,
        padding: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="wallet-outline" size={18} color={low ? "#dc2626" : Colors.primary} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.gray[500], letterSpacing: 0.4 }}>
            {mc("heading")}
          </Text>
        </View>
        {onTopUp ? (
        <TouchableOpacity
          onPress={onTopUp}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9999, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6 }}
          accessibilityRole="button"
          accessibilityLabel={mc("topUpA11y")}
        >
          <Ionicons name="add" size={14} color={Colors.white} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.white }}>{mc("topUp")}</Text>
        </TouchableOpacity>
        ) : null}
      </View>

      <Text style={{ marginTop: 8, fontSize: 28, fontWeight: "800", color: low ? "#dc2626" : Colors.gray[900] }}>
        {formatZar(balance)}
      </Text>

      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{mc("included", { amount: formatZar(included) })}</Text>
        <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{mc("purchased", { amount: formatZar(purchased) })}</Text>
        <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{mc("spentThisMonth", { amount: formatZar(spent) })}</Text>
      </View>

      {low ? (
        <Text style={{ marginTop: 10, fontSize: 13, color: "#b91c1c" }}>
          {mc("lowBalance")}
        </Text>
      ) : null}
    </View>
  );
}
