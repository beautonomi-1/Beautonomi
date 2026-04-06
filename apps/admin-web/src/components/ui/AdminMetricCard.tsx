import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  slate: "from-slate-800 to-slate-900 ring-slate-700/40",
  emerald: "from-emerald-700 to-teal-900 ring-emerald-600/30",
  violet: "from-violet-700 to-indigo-900 ring-violet-600/30",
  amber: "from-amber-700 to-orange-900 ring-amber-600/30",
  rose: "from-rose-700 to-red-900 ring-rose-600/30",
} as const;

export type AdminMetricCardVariant = keyof typeof variants;

export function AdminMetricCard({
  label,
  value,
  hint,
  variant = "slate",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  variant?: AdminMetricCardVariant;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg ring-1",
        variants[variant],
        className
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      <p className="text-xs font-medium uppercase tracking-wide text-white/75">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/60">{hint}</p> : null}
    </div>
  );
}
