import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  Calendar,
  Cpu,
  Home,
  MapPin,
  Network,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";
import { cn } from "@/lib/cn";

interface ActivityRow {
  id: string;
  type: string;
  action: string;
  entity_id: string;
  entity_name: string;
  timestamp: string;
  status: string;
}

interface GodsEyePayload {
  overview?: {
    total_users?: number;
    total_providers?: number;
    total_bookings?: number;
    total_revenue?: number;
    active_bookings?: number;
    pending_approvals?: number;
    house_call_bookings?: number;
    salon_bookings?: number;
  };
  revenue_breakdown?: {
    today?: number;
    this_week?: number;
    this_month?: number;
    all_time?: number;
  };
  bookings_by_status?: Record<string, number>;
  bookings_by_type?: { at_home?: number; at_salon?: number };
  recent_activity?: ActivityRow[];
  top_providers?: Array<{
    id: string;
    name: string;
    bookings_count: number;
    revenue: number;
    rating: number;
  }>;
  top_customers?: Array<{
    id: string;
    name: string;
    bookings_count: number;
    total_spent: number;
  }>;
  system_health?: {
    api_uptime?: number;
    database_status?: string;
    payment_gateway_status?: string;
    notification_service_status?: string;
  };
}

function activityIcon(type: string) {
  switch (type) {
    case "booking":
      return Calendar;
    case "user":
      return Users;
    case "provider":
      return Building2;
    default:
      return Activity;
  }
}

function ActivityLink({ row }: { row: ActivityRow }) {
  const inner = (
    <>
      <span className="font-medium text-gray-900">{row.entity_name}</span>
      <span className="text-gray-500"> — {row.action}</span>
    </>
  );
  if (row.type === "booking") {
    return (
      <Link to={adminSpaTo(`/admin/bookings/${row.entity_id}`)} className="hover:text-primary">
        {inner}
      </Link>
    );
  }
  if (row.type === "user") {
    return (
      <Link to={adminSpaTo(`/admin/users/${row.entity_id}`)} className="hover:text-primary">
        {inner}
      </Link>
    );
  }
  if (row.type === "provider") {
    return (
      <Link to={adminSpaTo(`/admin/providers/${row.entity_id}`)} className="hover:text-primary">
        {inner}
      </Link>
    );
  }
  return <span>{inner}</span>;
}

const quickLinks: { to: string; label: string; icon: LucideIcon; description: string }[] = [
  {
    to: "/admin/analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Trends, series, and breakdowns",
  },
  {
    to: "/admin/control-plane/overview",
    label: "Control plane",
    icon: Cpu,
    description: "Integrations, modules, maintenance",
  },
  {
    to: "/admin/reports",
    label: "Reports",
    icon: Sparkles,
    description: "Finance & operations exports",
  },
  {
    to: "/admin/finance",
    label: "Finance",
    icon: Wallet,
    description: "Ledger summary & ranges",
  },
  {
    to: "/admin/payouts",
    label: "Payouts",
    icon: Banknote,
    description: "Provider money movement",
  },
  {
    to: "/admin/settings/team-permissions",
    label: "Team permissions",
    icon: Shield,
    description: "Section × role matrix",
  },
  {
    to: "/admin/settings/tenant-domains",
    label: "Tenant domains",
    icon: Network,
    description: "Host mapping",
  },
];

export function GodsEyePage() {
  const { allowed, denied } = useSuperadminPage("Gods Eye is superadmin only.");

  const q = useQuery({
    queryKey: adminQueryKeys.godsEye(),
    queryFn: () => adminApi.getJson<GodsEyePayload>("/api/admin/gods-eye", { timeoutMs: 90_000 }),
    enabled: allowed,
  });

  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Gods Eye"
        description="Tenant-scoped operations. Revenue cards use net customer cash (payments − refunds, ledger net) — aligned with Analytics. Provider earnings tables use provider-side ledger rows."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((l) => (
          <Link
            key={l.to}
            to={adminSpaTo(l.to)}
            className="group flex items-start gap-3 rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:border-gray-300 hover:shadow-md"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
              <l.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                {l.label}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">{l.description}</span>
            </span>
          </Link>
        ))}
      </div>

      <AdminQueryBlock query={q}>
        {(payload) => {
          const o = payload?.overview;
          const rev = payload?.revenue_breakdown ?? {};
          const byStatus = payload?.bookings_by_status ?? {};
          const byType = payload?.bookings_by_type ?? {};
          const activity = payload?.recent_activity ?? [];
          const topProv = payload?.top_providers ?? [];
          const topCust = payload?.top_customers ?? [];
          const health = payload?.system_health ?? {};

          return (
            <>
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Revenue</h2>
                <p className="mb-4 text-xs text-gray-500">
                  Net collected cash per window (payments + extra charges − refunds). Dashboard “platform net” is commission after fees — open Finance for that view.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <AdminMetricCard
                    variant="emerald"
                    label="Today"
                    value={formatAdminCurrency(rev.today ?? 0)}
                  />
                  <AdminMetricCard
                    variant="violet"
                    label="This week"
                    value={formatAdminCurrency(rev.this_week ?? 0)}
                  />
                  <AdminMetricCard
                    variant="amber"
                    label="This month"
                    value={formatAdminCurrency(rev.this_month ?? 0)}
                  />
                  <AdminMetricCard
                    variant="slate"
                    label="All time"
                    value={formatAdminCurrency(rev.all_time ?? o?.total_revenue ?? 0)}
                  />
                </div>
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Scale</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <AdminMetricCard
                    variant="slate"
                    label="Customers"
                    value={formatAdminNumber(o?.total_users ?? 0)}
                    hint="Scoped to tenant"
                  />
                  <AdminMetricCard
                    variant="violet"
                    label="Active providers"
                    value={formatAdminNumber(o?.total_providers ?? 0)}
                  />
                  <AdminMetricCard
                    variant="emerald"
                    label="Total bookings"
                    value={formatAdminNumber(o?.total_bookings ?? 0)}
                  />
                  <AdminMetricCard
                    variant="rose"
                    label="Pending approvals"
                    value={formatAdminNumber(o?.pending_approvals ?? 0)}
                    hint="Provider queue"
                  />
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Bookings by status</h3>
                  <ul className="mt-4 space-y-3">
                    {Object.entries(byStatus).map(([k, v]) => {
                      const max = Math.max(1, ...Object.values(byStatus));
                      const pct = Math.round(((v as number) / max) * 100);
                      return (
                        <li key={k}>
                          <div className="flex justify-between text-sm">
                            <span className="capitalize text-gray-600">{k.replace(/_/g, " ")}</span>
                            <span className="font-medium tabular-nums text-gray-900">{formatAdminNumber(v as number)}</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-gray-900 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </AdminPanel>

                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Bookings by location</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <Home className="h-8 w-8 text-teal-600" aria-hidden />
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">At home</p>
                        <p className="text-xl font-semibold tabular-nums">{formatAdminNumber(byType.at_home ?? 0)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <MapPin className="h-8 w-8 text-violet-600" aria-hidden />
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">At salon</p>
                        <p className="text-xl font-semibold tabular-nums">{formatAdminNumber(byType.at_salon ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-gray-500">
                    Active pipeline:{" "}
                    <span className="font-medium text-gray-700">{formatAdminNumber(o?.active_bookings ?? 0)}</span>{" "}
                    in-flight bookings.
                  </p>
                </AdminPanel>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Top providers by earnings</h3>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-xs text-gray-500">
                          <th className="pb-2 pr-2 font-medium">Business</th>
                          <th className="pb-2 pr-2 font-medium">Bookings</th>
                          <th className="pb-2 pr-2 font-medium">Earnings</th>
                          <th className="pb-2 font-medium">Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProv.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-gray-500">
                              No provider data
                            </td>
                          </tr>
                        ) : (
                          topProv.map((p) => (
                            <tr key={p.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2 pr-2">
                                <Link
                                  className="font-medium text-primary hover:underline"
                                  to={adminSpaTo(`/admin/providers/${p.id}`)}
                                >
                                  {p.name}
                                </Link>
                              </td>
                              <td className="py-2 pr-2 tabular-nums text-gray-700">{p.bookings_count}</td>
                              <td className="py-2 pr-2 tabular-nums text-gray-900">{formatAdminCurrency(p.revenue)}</td>
                              <td className="py-2 tabular-nums text-gray-600">
                                {Number.isFinite(p.rating) ? p.rating.toFixed(1) : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </AdminPanel>

                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Top customers by spend</h3>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-xs text-gray-500">
                          <th className="pb-2 pr-2 font-medium">Customer</th>
                          <th className="pb-2 pr-2 font-medium">Bookings</th>
                          <th className="pb-2 font-medium">Spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCust.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-gray-500">
                              No customer data
                            </td>
                          </tr>
                        ) : (
                          topCust.map((c) => (
                            <tr key={c.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2 pr-2">
                                <Link
                                  className="font-medium text-primary hover:underline"
                                  to={adminSpaTo(`/admin/users/${c.id}`)}
                                >
                                  {c.name}
                                </Link>
                              </td>
                              <td className="py-2 pr-2 tabular-nums text-gray-700">{c.bookings_count}</td>
                              <td className="py-2 tabular-nums text-gray-900">{formatAdminCurrency(c.total_spent)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </AdminPanel>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <AdminPanel className="lg:col-span-2">
                  <h3 className="text-lg font-semibold text-gray-900">Recent activity</h3>
                  <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {activity.length === 0 ? (
                      <li className="text-sm text-gray-500">No recent events.</li>
                    ) : (
                      activity.map((row) => {
                        const Icon = activityIcon(row.type);
                        return (
                          <li
                            key={row.id}
                            className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2.5 text-sm"
                          >
                            <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-gray-600 shadow-sm ring-1 ring-gray-200">
                              <Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <ActivityLink row={row} />
                              <p className="mt-0.5 text-xs text-gray-400">
                                {row.timestamp ? new Date(row.timestamp).toLocaleString() : "—"}
                                {row.status ? (
                                  <span
                                    className={cn(
                                      "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase",
                                      row.status === "success" || row.status === "active"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-gray-200 text-gray-700"
                                    )}
                                  >
                                    {row.status}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </AdminPanel>

                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">System signals</h3>
                  <p className="mt-1 text-xs text-gray-500">Indicative checks — wire real probes in ops tooling.</p>
                  <ul className="mt-4 space-y-3 text-sm">
                    <li className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600">API</span>
                      <span className="font-medium tabular-nums text-gray-900">{health.api_uptime ?? "—"}%</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600">Database</span>
                      <span className="capitalize text-emerald-700">{health.database_status ?? "—"}</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600">Payments</span>
                      <span className="capitalize text-emerald-700">{health.payment_gateway_status ?? "—"}</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-gray-600">Notifications</span>
                      <span className="capitalize text-emerald-700">{health.notification_service_status ?? "—"}</span>
                    </li>
                  </ul>
                  <Link
                    to={adminSpaTo("/admin/system-health")}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Open system health
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </AdminPanel>
              </div>
            </>
          );
        }}
      </AdminQueryBlock>
    </div>
  );
}
