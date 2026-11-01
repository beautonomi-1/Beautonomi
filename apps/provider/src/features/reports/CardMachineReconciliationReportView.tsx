/**
 * Combined Yoco pending + PayCloud amount exceptions + awaiting machine refunds.
 */
import { useCallback, type ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { useRouter } from "expo-router";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { format } from "date-fns";

function isPayload(data: unknown): data is {
  yoco: Array<Record<string, unknown>>;
  paycloud: Array<Record<string, unknown>>;
  awaiting_refunds?: Array<Record<string, unknown>>;
  reportBasis?: string;
  summary: Record<string, unknown>;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "yoco" in data && "summary" in data;
}

export function CardMachineReconciliationReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const router = useRouter();
  const cm = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.cardMachineReconciliationReport.${key}`, opts) as string,
    [t],
  );

  if (!isPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const summary = data.summary;
  const yocoInWindow = Number(summary.yoco_payments_in_window ?? 0);
  const paycloudInWindow = Number(summary.paycloud_payments_in_window ?? 0);
  const paymentExceptions = Number(summary.payment_exceptions ?? data.yoco.length + data.paycloud.length);
  const awaiting = data.awaiting_refunds ?? [];
  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";

  const openBooking = (id: string) => {
    router.push(`/(app)/(tabs)/more/bookings/${id}` as never);
  };

  return (
    <View style={twStyle("gap-5 pb-8")}>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label={cm("yocoInWindow")} value={String(yocoInWindow)} tone="blue" />
        <Metric label={cm("paycloudInWindow")} value={String(paycloudInWindow)} tone="violet" />
        <Metric label={cm("paymentExceptions")} value={String(paymentExceptions)} tone="amber" />
        <Metric label={cm("awaitingRefunds")} value={String(awaiting.length)} tone="gray" />
      </View>

      {paymentExceptions === 0 ? (
        <Text style={twStyle("text-sm text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3")}>
          {cm("allMatched", { yoco: yocoInWindow, paycloud: paycloudInWindow })}
        </Text>
      ) : null}

      {awaiting.length > 0 ? (
        <Section title={cm("awaitingSection")} hint={cm("awaitingHint")}>
          {awaiting.map((row) => {
            const id = String(row.booking_id ?? "");
            const amount = Number(row.amount ?? 0);
            return (
              <Row
                key={String(row.id)}
                title={formatCurrency(amount)}
                subtitle={row.since ? format(new Date(String(row.since)), "PP p") : "—"}
                trailing={String(row.booking_ref ?? id.slice(0, 8))}
                onPress={id ? () => openBooking(id) : undefined}
              />
            );
          })}
        </Section>
      ) : null}

      {data.yoco.length > 0 ? (
        <Section title={cm("yocoPendingSection")}>
          {data.yoco.map((row) => (
            <Row
              key={String(row.id)}
              title={formatCurrency(Number(row.amount ?? 0) / 100)}
              subtitle={row.created_at ? format(new Date(String(row.created_at)), "PP p") : "—"}
              trailing={String(row.status ?? "")}
              onPress={
                row.appointment_id ? () => openBooking(String(row.appointment_id)) : undefined
              }
            />
          ))}
        </Section>
      ) : null}

      {data.paycloud.length > 0 ? (
        <Section title={cm("paycloudSection")}>
          {data.paycloud.map((row) => (
            <Row
              key={String(row.id)}
              title={formatCurrency(Number(row.amount ?? 0))}
              subtitle={row.created_at ? format(new Date(String(row.created_at)), "PP p") : "—"}
              trailing={String(row.amount_match_status ?? "")}
              onPress={row.booking_id ? () => openBooking(String(row.booking_id)) : undefined}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "violet" | "amber" | "gray";
}) {
  const toneMap = {
    blue: "border-blue-100 bg-blue-50/90",
    violet: "border-violet-100 bg-violet-50/90",
    amber: "border-amber-100 bg-amber-50/90",
    gray: "border-gray-100 bg-gray-50/90",
  };
  return (
    <View style={twStyle(`min-w-[140px] flex-1 rounded-2xl border px-4 py-3 ${toneMap[tone]}`)}>
      <Text style={twStyle("text-xs font-medium text-gray-600")}>{label}</Text>
      <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>{value}</Text>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={twStyle("gap-2")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{title}</Text>
      {hint ? <Text style={twStyle("text-sm text-gray-600 px-1")}>{hint}</Text> : null}
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>{children}</View>
    </View>
  );
}

function Row({
  title,
  subtitle,
  trailing,
  onPress,
}: {
  title: string;
  subtitle: string;
  trailing: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={twStyle("flex-row items-center justify-between px-4 py-3 border-b border-gray-50")}>
      <View style={twStyle("flex-1 pe-3")}>
        <Text style={twStyle("font-medium text-gray-900")}>{title}</Text>
        <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>{subtitle}</Text>
      </View>
      <Text style={twStyle("text-sm text-gray-500")}>{trailing}</Text>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}
