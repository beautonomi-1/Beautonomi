import { formatAdminCurrency } from "@/lib/adminFormatCurrency";

type Bridge = {
  starting_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
};

export function AdminMrrBridge({ bridge }: { bridge: Bridge }) {
  const steps: { label: string; value: number; sign: "+" | "−" | "=" }[] = [
    { label: "Starting MRR", value: bridge.starting_mrr, sign: "=" },
    { label: "New", value: bridge.new_mrr, sign: "+" },
    { label: "Expansion", value: bridge.expansion_mrr, sign: "+" },
    { label: "Contraction", value: bridge.contraction_mrr, sign: "−" },
    { label: "Churn", value: bridge.churned_mrr, sign: "−" },
    { label: "Ending MRR", value: bridge.ending_mrr, sign: "=" },
  ];
  const max = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 text-gray-600">{s.label}</span>
          <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
            <div
              className="absolute left-0 top-0 h-full rounded bg-violet-600/80"
              style={{ width: `${(Math.abs(s.value) / max) * 100}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right tabular-nums font-medium text-gray-900">
            {s.sign !== "=" && s.value > 0 ? `${s.sign} ` : ""}
            {formatAdminCurrency(s.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
