import { Link } from "react-router-dom";
import { Megaphone, History, Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminSpaTo } from "@/lib/adminSpaPath";

type BroadcastHistoryEnvelope = {
  data: {
    broadcasts: Array<{
      channel: string;
      created_at?: string;
      sent_at?: string;
      metadata?: Record<string, unknown> | null;
    }>;
    meta: { total: number };
  };
};

function useThisMonthStats(enabled: boolean) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  // Fetch last 200 (more than enough for a month's activity)
  return useQuery({
    queryKey: adminQueryKeys.broadcastHistory(`hub-stats|${monthStart}`),
    queryFn: () =>
      adminApi.getRawJson<BroadcastHistoryEnvelope>(
        "/api/admin/broadcast/history?limit=200&page=1",
        { timeoutMs: 30_000 },
      ),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function BroadcastHubPage() {
  const { denied, allowed } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const statsQ = useThisMonthStats(allowed);

  if (denied) return denied;

  const now = Date.now();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const broadcasts = statsQ.data?.data?.broadcasts ?? [];
  const total = statsQ.data?.data?.meta?.total;

  const thisMonthCount = broadcasts.filter((b) => {
    const d = new Date(b.created_at ?? b.sent_at ?? "");
    return !Number.isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const activePromos = broadcasts.filter((b) => {
    const meta = b.metadata && typeof b.metadata === "object" ? b.metadata : {};
    const annType = String(meta.announcement_type ?? "");
    if (annType !== "promotion") return false;
    const exp = meta.expires_at;
    if (typeof exp !== "string" || !exp.trim()) return false;
    const t = Date.parse(exp);
    return Number.isFinite(t) && t > now;
  }).length;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Broadcast"
        description="Compose campaigns and review delivery history."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          to={adminSpaTo("/admin/broadcast/compose")}
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200/90 bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 p-6 text-white shadow-lg ring-1 ring-white/10 transition hover:shadow-xl hover:ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <div>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Megaphone className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Compose campaign</h2>
            <p className="mt-2 max-w-sm text-sm text-violet-100">
              3-step wizard: audience → rich content → preview & send.
            </p>
          </div>
          <span className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-white/95">
            Open composer →
          </span>
        </Link>

        <Link
          to={adminSpaTo("/admin/broadcast/history")}
          className="group flex flex-col justify-between rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:border-gray-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <div>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700 ring-1 ring-gray-200">
              <History className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Delivery history</h2>
            <p className="mt-2 text-sm text-gray-600">
              Paginated log from{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">GET /api/admin/broadcast/history</code>.
              Filter by channel, click rows for detail, duplicate entries.
            </p>
          </div>
          <span className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-gray-900 group-hover:underline">
            View history →
          </span>
        </Link>

        <Link
          to={adminSpaTo("/admin/broadcast/history?channel=push")}
          className="group flex flex-col justify-between rounded-2xl border border-amber-200/80 bg-amber-50 p-6 shadow-sm ring-1 ring-amber-950/[0.04] transition hover:border-amber-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        >
          <div>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <Bell className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-amber-900">Active announcements</h2>
            <p className="mt-2 text-sm text-amber-700">
              Push broadcasts with non-expired promotion banners visible in both apps.
            </p>
            <p className="mt-3 text-3xl font-bold tabular-nums text-amber-900">
              {statsQ.isLoading ? "…" : activePromos}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">active promotion(s)</p>
          </div>
          <span className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-amber-900 group-hover:underline">
            View push history →
          </span>
        </Link>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {[
          {
            label: "Total broadcasts",
            value: statsQ.isLoading ? "…" : total != null ? String(total) : "—",
          },
          {
            label: "This month",
            value: statsQ.isLoading ? "…" : String(thisMonthCount),
          },
          {
            label: "Active promotions",
            value: statsQ.isLoading ? "…" : String(activePromos),
          },
          {
            label: "Push broadcasts",
            value: statsQ.isLoading ? "…" : String(broadcasts.filter((b) => b.channel === "push").length),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ring-1 ring-gray-950/[0.04]"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
