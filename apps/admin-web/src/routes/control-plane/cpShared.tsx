import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

export const CP_ENVS = ["development", "staging", "production"] as const;

export function CpBack({ to = "../overview", label = "Control plane" }: { to?: string; label?: string }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function EnvSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">Environment</span>
      <select
        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {CP_ENVS.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CpField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      {children}
    </div>
  );
}
