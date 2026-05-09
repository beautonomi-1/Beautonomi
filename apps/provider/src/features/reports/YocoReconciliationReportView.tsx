/**
 * Yoco reconciliation: provider_yoco_payments vs booking_payments for booking-linked captures.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { format } from "date-fns";

function centsToMajor(cents: number): number {
  return Number(cents ?? 0) / 100;
}

function isYocoReconciliationPayload(data: unknown): data is {
  payments: Array<{
    id: string;
    yoco_payment_id: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    link_kind: string;
    booking_synced: boolean;
  }>;
  summary: {
    total: number;
    with_booking: number;
    with_sale_only: number;
    unlinked: number;
    synced: number;
    not_synced: number;
  };
  reportBasis?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  limit?: number;
  basis?: Record<string, string>;
  note?: string;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "payments" in data && "summary" in data;
}

export function YocoReconciliationReportView({ data }: { data: unknown }) {
  if (!isYocoReconciliationPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const range =
    typeof data.fromYmd === "string" && typeof data.toYmd === "string"
      ? `${data.fromYmd} → ${data.toYmd}`
      : "";
  const lim = typeof data.limit === "number" ? data.limit : "";
  const s = data.summary;

  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];
  const basisLabels: Record<string, string> = {
    source: "Source",
    syncDefinition: "Sync",
    amountUnits: "Amounts",
    locationFilter: "Location",
  };

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone · {tz}</Text> : null}
          {range ? <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>Capture window · {range}</Text> : null}
          {lim !== "" ? <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>Row cap · {lim}</Text> : null}
        </View>
      ) : null}

      {data.note ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-amber-950")}>{data.note}</Text>
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>Definitions</Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{basisLabels[k] ?? k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-gray-600")}>Rows</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>{s.total}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-blue-900")}>Booking link</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-blue-950")}>{s.with_booking}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>Synced</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>{s.synced}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-900")}>Not synced</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-amber-950")}>{s.not_synced}</Text>
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Payments</Text>
      {(data.payments ?? []).slice(0, 40).map((p) => (
        <View key={p.id} style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-500")}>
            {format(new Date(p.created_at), "MMM d, yyyy HH:mm")} · {p.link_kind} · {p.status}
          </Text>
          <Text style={twStyle("mt-1 font-mono text-xs text-gray-800")}>{p.yoco_payment_id}</Text>
          <Text style={twStyle("mt-2 text-base font-semibold text-gray-900")}>
            {formatCurrency(centsToMajor(p.amount), p.currency)}
          </Text>
          {p.link_kind === "booking" ? (
            <Text style={twStyle("mt-1 text-sm text-gray-700")}>
              {p.booking_synced ? "Synced to booking_payments" : "Missing booking_payments row"}
            </Text>
          ) : (
            <Text style={twStyle("mt-1 text-sm text-gray-500")}>Booking sync not applicable</Text>
          )}
        </View>
      ))}
    </View>
  );
}
