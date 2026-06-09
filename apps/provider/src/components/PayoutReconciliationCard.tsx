import { View, Text } from "react-native";
import { twStyle } from "@/lib/twStyle";

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
  const Row = ({ label, value, muted }: { label: string; value: number; muted?: boolean }) => (
    <View style={twStyle("flex-row items-center justify-between py-1")}>
      <Text style={twStyle(`flex-1 pr-3 text-xs ${muted ? "text-gray-500" : "text-gray-700"}`)}>{label}</Text>
      <Text style={twStyle(`text-xs font-medium ${muted ? "text-gray-500" : "text-gray-900"}`)}>
        {money(value, currency)}
      </Text>
    </View>
  );

  return (
    <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
      <Text style={twStyle("text-sm font-semibold text-gray-900")}>How your available balance is calculated</Text>
      <Text style={twStyle("mt-1 text-xs text-gray-500")}>
        Revenue reports can read higher because they include cash you collected directly and ignore the
        hold period and pending requests. Full bridge:
      </Text>
      <View style={twStyle("mt-3")}>
        <Row label="Recognized payoutable earnings (net of refunds)" value={reconciliation.recognized_payoutable_earnings} />
        <Row label="− Cash / Yoco / EFT you collected directly" value={reconciliation.excluded_provider_collected} muted />
        <Row
          label={`− On hold${payoutHoldDays && payoutHoldDays > 0 ? ` (clears ${payoutHoldDays} days after each booking)` : ""}`}
          value={reconciliation.on_hold}
          muted
        />
        <Row label="− Pending / processing requests" value={reconciliation.pending_payouts} muted />
        <Row label="− Already paid out" value={reconciliation.already_paid_out} muted />
        <View style={twStyle("mt-2 flex-row items-center justify-between border-t border-gray-100 pt-2")}>
          <Text style={twStyle("text-sm font-semibold text-gray-900")}>= Available to withdraw</Text>
          <Text style={twStyle("text-sm font-bold text-emerald-600")}>
            {money(reconciliation.available_balance, currency)}
          </Text>
        </View>
      </View>
      <Text style={twStyle("mt-3 text-[10px] text-gray-400")}>
        Subscription and ads are billed to your card separately and never reduce this balance.
      </Text>
    </View>
  );
}
