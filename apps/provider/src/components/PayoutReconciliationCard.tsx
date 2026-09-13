import { View, Text } from "react-native";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";

export interface PayoutReconciliation {
  recognized_payoutable_earnings: number;
  on_hold: number;
  excluded_provider_collected: number;
  already_paid_out: number;
  pending_payouts: number;
  available_balance: number;
}

interface Props {
  reconciliation: PayoutReconciliation;
  currency: string;
  payoutHoldDays?: number;
}

function money(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  return `${sign}${currency}${abs.toFixed(2)}`;
}

/**
 * Explains how "available to withdraw" is derived from recognized payoutable earnings, so
 * providers understand why headline revenue reports read higher (they include cash collected
 * directly and ignore the hold period / pending requests). Mirrors the web finance page.
 */
export function PayoutReconciliationCard({ reconciliation, currency, payoutHoldDays }: Props) {
  const { t } = useTranslation();
  const prc = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.components.payoutReconciliation.${key}`, opts) as string;
  const Row = ({ label, value, muted }: { label: string; value: number; muted?: boolean }) => (
    <View style={twStyle("flex-row items-center justify-between py-1")}>
      <Text style={twStyle(`flex-1 pe-3 text-xs ${muted ? "text-gray-500" : "text-gray-700"}`)}>{label}</Text>
      <Text style={twStyle(`text-xs font-medium ${muted ? "text-gray-500" : "text-gray-900"}`)}>
        {money(value, currency)}
      </Text>
    </View>
  );

  return (
    <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{prc("title")}</Text>
      <Text style={twStyle("mt-1 text-xs text-gray-500")}>
        {prc("intro")}
      </Text>
      <View style={twStyle("mt-3")}>
        <Row label={prc("recognizedEarnings")} value={reconciliation.recognized_payoutable_earnings} />
        {reconciliation.excluded_provider_collected > 0 ? (
          <Row
            label={prc("excludedCollected")}
            value={reconciliation.excluded_provider_collected}
            muted
          />
        ) : null}
        <Row
          label={
            payoutHoldDays && payoutHoldDays > 0
              ? prc("onHoldWithDays", { count: payoutHoldDays })
              : prc("onHold")
          }
          value={reconciliation.on_hold}
          muted
        />
        <Row label={prc("pendingRequests")} value={reconciliation.pending_payouts} muted />
        <Row label={prc("alreadyPaidOut")} value={reconciliation.already_paid_out} muted />
        <View style={twStyle("mt-2 flex-row items-center justify-between border-t border-gray-100 pt-2")}>
          <Text style={twStyle("text-sm font-semibold text-gray-900")}>{prc("available")}</Text>
          <Text style={twStyle("text-sm font-bold text-emerald-600")}>
            {money(reconciliation.available_balance, currency)}
          </Text>
        </View>
      </View>
      <Text style={twStyle("mt-3 text-[10px] text-gray-400")}>
        {prc("footer")}
      </Text>
    </View>
  );
}
