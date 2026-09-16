import { Link } from "react-router";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

export type QueueHubMetric = {
  label: string;
  value: number | string;
  urgent?: boolean;
  href?: string;
};

export type QueueHubQuickLink = {
  id: string;
  label: string;
  href: string;
  description?: string;
  count?: number;
  variant?: "urgent" | "mine" | "unassigned" | "default";
};

export type QueueHubToolCard = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const QUICK_VARIANT_CLASS: Record<NonNullable<QueueHubQuickLink["variant"]>, string> = {
  urgent: "border-red-200 bg-red-50/60 hover:bg-red-50",
  mine: "border-blue-200 bg-blue-50/60 hover:bg-blue-50",
  unassigned: "border-amber-200 bg-amber-50/60 hover:bg-amber-50",
  default: "border-gray-200 bg-white hover:bg-gray-50",
};

export function AdminSectionQueueHub({
  title,
  description,
  metrics = [],
  quickLinks = [],
  queueLinks = [],
  toolCards = [],
}: {
  title: string;
  description: string;
  metrics?: QueueHubMetric[];
  quickLinks?: QueueHubQuickLink[];
  queueLinks?: Array<{
    title: string;
    description: string;
    href: string;
    count?: number;
    urgent?: boolean;
  }>;
  toolCards?: QueueHubToolCard[];
}) {
  return (
    <div className="space-y-8">
      <AdminPageHeader title={title} description={description} />

      {metrics.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => {
            const inner = (
              <>
                <p
                  className={cn(
                    "text-xs font-medium uppercase tracking-wide",
                    m.urgent ? "text-red-800" : "text-gray-600",
                  )}
                >
                  {m.label}
                </p>
                <p
                  className={cn(
                    "mt-1 text-3xl font-semibold tabular-nums",
                    m.urgent ? "text-red-900" : "text-gray-900",
                  )}
                >
                  {m.value}
                </p>
              </>
            );
            const boxClass = cn(
              "rounded-xl border p-4 transition",
              m.urgent ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50",
              m.href && "hover:border-gray-300 hover:bg-white",
            );
            return m.href ? (
              <Link key={m.label} to={adminSpaTo(m.href)} className={boxClass}>
                {inner}
              </Link>
            ) : (
              <div key={m.label} className={boxClass}>
                {inner}
              </div>
            );
          })}
        </div>
      ) : null}

      {quickLinks.length > 0 ? (
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Quick queues</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.id}
                to={adminSpaTo(link.href)}
                className={cn(
                  "block rounded-xl border p-4 transition",
                  QUICK_VARIANT_CLASS[link.variant ?? "default"],
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{link.label}</p>
                    {link.description ? (
                      <p className="mt-1 text-sm text-gray-600">{link.description}</p>
                    ) : null}
                  </div>
                  {link.count != null ? (
                    <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-gray-800 ring-1 ring-gray-200">
                      {link.count}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </AdminPanel>
      ) : null}

      {queueLinks.length > 0 ? (
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Queues</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {queueLinks.map((item) => {
              const isUrgent = item.urgent && (item.count ?? 0) > 0;
              return (
                <li key={item.href}>
                  <Link
                    to={adminSpaTo(item.href)}
                    className={cn(
                      "block rounded-xl border p-4 transition hover:bg-gray-50",
                      isUrgent ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{item.title}</p>
                        <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                      </div>
                      {item.count != null ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                            isUrgent ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700",
                          )}
                        >
                          {item.count}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </AdminPanel>
      ) : null}

      {toolCards.length > 0 ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Tools</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {toolCards.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-950/[0.04] transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
              >
                <div className={cn("bg-gradient-to-br px-5 py-4 text-white", c.accent)}>
                  <c.icon className="h-8 w-8 opacity-90" aria-hidden />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-lg font-semibold text-gray-900">{c.label}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{c.description}</p>
                  <span className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-gray-900 group-hover:underline">
                    Open →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
