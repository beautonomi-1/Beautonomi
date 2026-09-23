import { AdminPanel } from "@/components/ui/AdminPanel";

export type MetricContractRow = {
  key: string;
  label: string;
  formula: string;
  source: string[];
  timezone: string;
  cadence: string;
};

type Props = {
  title?: string;
  contractVersion?: string | null;
  generatedAt?: string | null;
  contracts: MetricContractRow[];
  defaultOpen?: boolean;
};

/** Shared glossary so dashboard, analytics, and finance describe metrics the same way. */
export function AdminMetricContractsGlossary({
  title = "Metric glossary",
  contractVersion,
  generatedAt,
  contracts,
  defaultOpen = false,
}: Props) {
  if (!contracts.length) return null;

  return (
    <AdminPanel>
      <details open={defaultOpen}>
        <summary className="cursor-pointer text-base font-semibold text-gray-900">{title}</summary>
        {contractVersion || generatedAt ? (
          <p className="mt-2 text-xs text-gray-500">
            {contractVersion ? `Contracts ${contractVersion}` : null}
            {contractVersion && generatedAt ? " · " : null}
            {generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : null}
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          {contracts.map((metric) => (
            <div key={metric.key} className="rounded-lg border border-gray-200 p-3 text-sm">
              <p className="font-medium text-gray-900">{metric.label}</p>
              <p className="mt-1 font-mono text-xs text-gray-700">{metric.formula}</p>
              <p className="mt-1 text-xs text-gray-500">
                Source: {metric.source.join(", ")} · TZ: {metric.timezone} · Cadence: {metric.cadence}
              </p>
            </div>
          ))}
        </div>
      </details>
    </AdminPanel>
  );
}
