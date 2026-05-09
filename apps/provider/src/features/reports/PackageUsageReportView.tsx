/**
 * Package usage: event counts per package and distinct clients (individual + group participants).
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { twStyle } from "@/lib/twStyle";

type PackageUsageRow = {
  packageId?: string;
  packageName?: string;
  totalUsage?: number;
  uniqueClientsCount?: number;
  averageUsagePerClient?: number;
};

type TopClientRow = {
  clientId?: string;
  clientName?: string;
  email?: string;
  packagesUsed?: number;
};

function isPackageUsagePayload(data: unknown): data is {
  reportBasis?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  basis?: Record<string, string>;
  totalPackagesUsed: number;
  totalUniqueClients: number;
  packageUsage?: PackageUsageRow[];
  topClients?: TopClientRow[];
} {
  return (
    data != null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof (data as { totalPackagesUsed?: unknown }).totalPackagesUsed === "number" &&
    typeof (data as { totalUniqueClients?: unknown }).totalUniqueClients === "number"
  );
}

const BASIS_LABELS: Record<string, string> = {
  usage: "Usage events",
  uniqueClients: "Distinct clients",
  topClients: "Top clients",
};

export function PackageUsageReportView({ data }: { data: unknown }) {
  if (!isPackageUsagePayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const period =
    typeof data.fromYmd === "string" && typeof data.toYmd === "string"
      ? `${data.fromYmd} – ${data.toYmd}`
      : "";

  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const rows = Array.isArray(data.packageUsage) ? data.packageUsage : [];
  const top = Array.isArray(data.topClients) ? data.topClients : [];

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>

      {basisText ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            What this report counts
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basisText}</Text>
          <View style={twStyle("mt-2 gap-1")}>
            {tz ? (
              <Text style={twStyle("text-xs text-sky-900/85")}>Timezone · {tz}</Text>
            ) : null}
            {period ? (
              <Text style={twStyle("text-xs text-sky-900/85")}>Calendar window · {period}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>
            Definitions
          </Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{BASIS_LABELS[k] ?? k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-cyan-100 bg-cyan-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-cyan-950")}>Usage events</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-cyan-950")}>
            {data.totalPackagesUsed}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-cyan-950/90")}>
            One per qualifying booking or group event tied to a package in range.
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>Distinct clients</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>
            {data.totalUniqueClients}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-indigo-900/90")}>
            Union of customer IDs from bookings and group participants (deduped).
          </Text>
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        By package
      </Text>
      {rows.length === 0 ? (
        <Text style={twStyle("text-sm text-gray-500")}>No package usage in this range.</Text>
      ) : (
        rows.map((p, i) => (
          <View
            key={p.packageId ?? `${p.packageName ?? "pkg"}-${i}`}
            style={twStyle(
              "rounded-2xl border border-gray-100 bg-white px-4 py-3",
            )}
          >
            <View style={twStyle("flex-row items-start justify-between gap-3")}>
              <View style={twStyle("flex-1 flex-row items-center gap-2")}>
                <View style={twStyle("h-8 w-8 items-center justify-center rounded-full bg-cyan-600")}>
                  <Text style={twStyle("text-xs font-bold text-white")}>{i + 1}</Text>
                </View>
                <Text style={twStyle("flex-1 font-medium text-gray-900")} numberOfLines={2}>
                  {p.packageName ?? "Package"}
                </Text>
              </View>
            </View>
            <View style={twStyle("mt-2 flex-row flex-wrap gap-x-4 gap-y-1 pl-10")}>
              <Text style={twStyle("text-xs text-gray-600")}>
                Events · <Text style={twStyle("font-semibold text-gray-900")}>{Number(p.totalUsage ?? 0)}</Text>
              </Text>
              <Text style={twStyle("text-xs text-gray-600")}>
                Distinct clients ·{" "}
                <Text style={twStyle("font-semibold text-gray-900")}>
                  {Number(p.uniqueClientsCount ?? 0)}
                </Text>
              </Text>
              <Text style={twStyle("text-xs text-gray-600")}>
                Avg events / client ·{" "}
                <Text style={twStyle("font-semibold text-gray-900")}>
                  {Number(p.averageUsagePerClient ?? 0).toFixed(2)}
                </Text>
              </Text>
            </View>
          </View>
        ))
      )}

      {top.length > 0 ? (
        <>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            Top clients (by package-included bookings)
          </Text>
          {top.map((c, i) => (
            <View
              key={c.clientId ?? `client-${i}`}
              style={twStyle(
                "flex-row items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3",
              )}
            >
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("font-medium text-gray-900")} numberOfLines={1}>
                  {c.clientName ?? "Client"}
                </Text>
                {c.email ? (
                  <Text style={twStyle("text-xs text-gray-500")} numberOfLines={1}>
                    {c.email}
                  </Text>
                ) : null}
              </View>
              <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>
                {Number(c.packagesUsed ?? 0)}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
