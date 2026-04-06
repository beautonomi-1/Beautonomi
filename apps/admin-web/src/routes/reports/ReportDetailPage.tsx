import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";

const API_PATHS: Record<string, string> = {
  revenue: "/api/admin/reports/revenue",
  bookings: "/api/admin/reports/bookings",
  providers: "/api/admin/reports/providers",
  customers: "/api/admin/reports/customers",
  "gift-cards": "/api/admin/reports/gift-cards",
  "yoco-reconciliation": "/api/admin/reports/yoco-reconciliation",
};

const TITLES: Record<string, string> = {
  revenue: "Revenue report",
  bookings: "Booking report",
  providers: "Provider report",
  customers: "Customer report",
  "gift-cards": "Gift card report",
  "yoco-reconciliation": "Yoco reconciliation",
};

function pickFirstObjectArray(data: Record<string, unknown>): Record<string, unknown>[] | null {
  for (const v of Object.values(data)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    if (typeof v[0] === "object" && v[0] !== null && !Array.isArray(v[0])) {
      return v as Record<string, unknown>[];
    }
  }
  return null;
}

export function ReportDetailPage() {
  const { reportKey = "" } = useParams<{ reportKey: string }>();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview access is required for these reports (matches API requireAdminSection overview)."
  );
  const [sp, setSp] = useSearchParams();
  const period = sp.get("period") || "30d";
  const apiPath = API_PATHS[reportKey];

  const q = useQuery({
    queryKey: adminQueryKeys.reports.detail(reportKey, period),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("period", period);
      return adminApi.getJson<Record<string, unknown>>(`${apiPath}?${p}`, { timeoutMs: 90_000 });
    },
    enabled: allowed && !!apiPath,
  });

  const table = useMemo(() => {
    const d = q.data;
    if (!d) return null;
    const rows = pickFirstObjectArray(d);
    if (!rows) return null;
    const cols = Object.keys(rows[0]);
    return { cols, rows };
  }, [q.data]);

  if (!apiPath) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Report" />
        <EmptyState title="Unknown report" description={reportKey} />
        <Link to="/reports" className="text-sm font-medium text-gray-900 underline">
          ← Reports hub
        </Link>
      </div>
    );
  }

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title={TITLES[reportKey] ?? "Report"} />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const title = TITLES[reportKey] ?? "Report";
  const scalars = q.data
    ? Object.entries(q.data).filter(
        ([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean"
      )
    : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={title}
        description={`GET ${apiPath} · AuthZ: overview (API). Finance-nav links may not match role matrix — see progress report.`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/reports" className="text-sm text-gray-600 hover:text-gray-900">
          ← Reports hub
        </Link>
        <label className="text-sm text-gray-600">
          Period{" "}
          <select
            className="ml-1 rounded border border-gray-300 px-2 py-1 text-sm"
            value={period}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              n.set("period", e.target.value);
              setSp(n, { replace: true });
            }}
          >
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="90d">90d</option>
            <option value="1y">1y</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          onClick={() =>
            void downloadAdminBlob(
              `/api/admin/export/analytics?period=${encodeURIComponent(period)}`,
              `analytics-export-${period}.csv`
            ).catch(() => alert("Export failed"))
          }
        >
          Download CSV (analytics export)
        </button>
      </div>

      {scalars.length > 0 ? (
        <AdminPanel>
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {scalars.map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      ) : null}

      {table && table.rows.length > 0 ? (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              {table.cols.map((c) => (
                <AdminTh key={c}>{c}</AdminTh>
              ))}
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {table.rows.slice(0, 100).map((r, i) => (
              <tr key={i}>
                {table.cols.map((c) => (
                  <AdminTd key={c} className="max-w-[14rem] truncate text-xs">
                    {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}
                  </AdminTd>
                ))}
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      ) : (
        <AdminPanel>
          <p className="text-sm text-gray-600">No tabular series detected; open legacy for full charts.</p>
        </AdminPanel>
      )}
    </div>
  );
}
