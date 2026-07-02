/**
 * Paystack Terminal reconciliation — received payments vs allocations.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatStatusLabel } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { format } from "date-fns";

type PaystackRow = {
  id: string;
  paystack_reference: string;
  paid_amount: number;
  currency: string;
  allocation_status: string;
  amount_match_status: string;
  payout_eligibility_status: string;
  created_at: string;
  terminal?: { name?: string | null; terminal_code?: string | null };
};

function isPaystackPayload(data: unknown): data is {
  rows: PaystackRow[];
  totals: Record<string, number>;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "rows" in data;
}

function isFeatureOffPayload(data: unknown): boolean {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  const code = String(d.code ?? d.error ?? "").toLowerCase();
  return (
    code.includes("not_enabled") ||
    code.includes("feature") ||
    code.includes("paystack_terminal") ||
    String(d.message ?? "").toLowerCase().includes("not enabled") ||
    String(d.message ?? "").toLowerCase().includes("paystack virtual terminal")
  );
}

const CURRENCY_TOTAL_KEYS = new Set(["received", "allocated", "unallocated", "held", "eligible", "declined"]);

export function PaystackReconciliationReportView({ data }: { data: unknown }) {
  if (isFeatureOffPayload(data)) {
    return (
      <View style={twStyle("items-center px-6 py-12")}>
        <Text style={twStyle("text-center text-base font-semibold text-gray-800")}>
          Paystack Terminal not enabled
        </Text>
        <Text style={twStyle("mt-2 text-center text-sm leading-5 text-gray-500")}>
          This reconciliation report is only available when Paystack Virtual Terminal is active on your account.
          Contact your administrator to enable it.
        </Text>
      </View>
    );
  }

  if (!isPaystackPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const rows = data.rows ?? [];
  const totals = data.totals ?? {};

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <View style={twStyle("flex-row flex-wrap gap-2")}>
        {Object.entries(totals).map(([key, value]) => (
          <View key={key} style={twStyle("min-w-[120px] flex-1 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2")}>
            <Text style={twStyle("text-xs text-gray-500")}>{formatStatusLabel(key)}</Text>
            <Text style={twStyle("text-lg font-semibold text-gray-900")}>
              {CURRENCY_TOTAL_KEYS.has(key) ? formatCurrency(Number(value)) : String(value)}
            </Text>
          </View>
        ))}
      </View>

      {rows.length === 0 ? (
        <Text style={twStyle("text-sm text-gray-500")}>No Paystack Terminal payments in this window.</Text>
      ) : (
        <View style={twStyle("overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
          {rows.map((row, idx) => (
            <View
              key={row.id}
              style={twStyle(
                `px-4 py-3 ${idx < rows.length - 1 ? "border-b border-gray-50" : ""}`,
              )}
            >
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {formatCurrency(row.paid_amount, row.currency)}
              </Text>
              <Text style={twStyle("mt-0.5 font-mono text-xs text-gray-500")}>{row.paystack_reference}</Text>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {row.terminal?.name || row.terminal?.terminal_code || "Terminal"} ·{" "}
                {format(new Date(row.created_at), "MMM d, yyyy HH:mm")}
              </Text>
              <Text style={twStyle("mt-1 text-xs text-gray-600")}>
                {formatStatusLabel(row.allocation_status)} · {formatStatusLabel(row.payout_eligibility_status)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
