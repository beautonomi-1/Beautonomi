import type { ReactNode } from "react";
import { Link } from "react-router";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { cn } from "@/lib/cn";

export type Entity360PanelKey = "money" | "history" | "tickets" | "risk" | "audit";

const PANEL_LABELS: Record<Entity360PanelKey, string> = {
  money: "Money",
  history: "History",
  tickets: "Tickets",
  risk: "Risk",
  audit: "Audit",
};

const PANEL_ORDER: Entity360PanelKey[] = ["money", "history", "tickets", "risk", "audit"];

export type Entity360Panels = Partial<Record<Entity360PanelKey, ReactNode>>;

export function Entity360PanelsGrid({ panels, className }: { panels: Entity360Panels; className?: string }) {
  const keys = PANEL_ORDER.filter((k) => panels[k] != null);
  if (keys.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {keys.map((key) => (
        <div
          key={key}
          className="rounded-xl border border-gray-200/90 bg-white p-3 shadow-sm ring-1 ring-gray-950/[0.03] md:p-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{PANEL_LABELS[key]}</p>
          <div className="mt-2 min-w-0 text-sm text-gray-900">{panels[key]}</div>
        </div>
      ))}
    </div>
  );
}

export function Entity360CompactLink({
  href,
  label,
  count,
  hint,
}: {
  href: string;
  label: string;
  count?: number | null;
  hint?: string;
}) {
  return (
    <Link to={href} className="group block min-w-0">
      <span className="flex items-baseline gap-2">
        <span className="font-medium text-primary group-hover:underline">{label}</span>
        {typeof count === "number" ? (
          <span className="tabular-nums text-xs font-semibold text-gray-600">({count})</span>
        ) : null}
      </span>
      {hint ? <span className="mt-0.5 block text-xs text-gray-500">{hint}</span> : null}
    </Link>
  );
}

export function Entity360Layout({
  title,
  description,
  primaryAction,
  backLink,
  banner,
  toolbar,
  panels,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  primaryAction?: ReactNode;
  backLink?: ReactNode;
  banner?: ReactNode;
  toolbar?: ReactNode;
  panels?: Entity360Panels;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      {backLink}
      <AdminPageHeader title={title} description={description} actions={primaryAction} />
      {banner}
      {panels ? <Entity360PanelsGrid panels={panels} /> : null}
      {toolbar}
      {children}
    </div>
  );
}
