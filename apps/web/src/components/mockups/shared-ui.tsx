import React from "react";
import { ChevronRight } from "lucide-react";

export function ScreenTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function BookingCard({
  time,
  endTime,
  service,
  client,
  status,
  statusColors,
  traits,
  accent = "border-l-primary",
}: {
  time: string;
  endTime: string;
  service: string;
  client: string;
  status: string;
  statusColors: string;
  traits?: string[];
  accent?: string;
}) {
  return (
    <div className={`mb-2.5 overflow-hidden rounded-3xl border border-gray-100 bg-white p-3 shadow-sm ${accent} border-l-[3px]`}>
      <div className="flex gap-3">
        <div className="w-[52px] flex-shrink-0">
          <p className="text-sm font-extrabold text-gray-900">{time}</p>
          <p className="text-[10px] text-gray-400">{endTime}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{service}</p>
          <p className="truncate text-xs text-gray-600">{client}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              {status}
            </span>
            {traits?.map((t) => (
              <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  badge,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3">
      {icon ? <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {badge ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>
          ) : null}
        </div>
        {subtitle ? <p className="truncate text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      {trailing ?? <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "amber" | "green";
}) {
  const tones = {
    default: "border-gray-200 bg-white",
    primary: "border-primary/30 bg-primary/5",
    amber: "border-amber-200 bg-amber-50",
    green: "border-green-200 bg-green-50",
  };
  const labelTones = {
    default: "text-gray-500",
    primary: "text-primary",
    amber: "text-amber-700",
    green: "text-green-700",
  };
  return (
    <div className={`rounded-xl border p-2.5 ${tones[tone]}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${labelTones[tone]}`}>{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

export function TableRow({
  cells,
  header,
}: {
  cells: string[];
  header?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 border-b border-gray-100 px-3 py-2 text-xs ${
        header ? "bg-gray-50 font-semibold text-gray-500" : "text-gray-700"
      }`}
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((cell, i) => (
        <span key={i} className="truncate">
          {cell}
        </span>
      ))}
    </div>
  );
}

export function SettingsCard({
  title,
  items,
}: {
  title?: string;
  items: { label: string; subtitle?: string; badge?: string }[];
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-gray-100 bg-white">
      {title ? <p className="border-b border-gray-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">{title}</p> : null}
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex items-center justify-between gap-2 px-3 py-2.5 ${i < items.length - 1 ? "border-b border-gray-100" : ""}`}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{item.label}</p>
            {item.subtitle ? <p className="text-xs text-gray-500">{item.subtitle}</p> : null}
          </div>
          {item.badge ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{item.badge}</span>
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
          )}
        </div>
      ))}
    </div>
  );
}

export function ScreenSection({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function PillTabs({
  tabs,
  activeIndex = 0,
}: {
  tabs: string[];
  activeIndex?: number;
}) {
  return (
    <div className="mb-3 flex gap-1 rounded-full bg-gray-100 p-1">
      {tabs.map((tab, i) => (
        <button
          key={tab}
          type="button"
          className={`flex-1 rounded-full py-1.5 text-[10px] font-semibold ${
            i === activeIndex ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
