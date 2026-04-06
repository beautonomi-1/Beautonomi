import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
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
import { adminSpaTo } from "@/lib/adminSpaPath";

type ReviewsPayload = {
  reviews: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  statistics: Record<string, unknown>;
};

export function ReviewsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "all";
  const providerId = sp.get("provider_id")?.trim() || "";
  const customerId = sp.get("customer_id")?.trim() || "";
  const qk = useMemo(
    () => adminQueryKeys.reviews(`p=${page}|s=${status}|pv=${providerId}|cu=${customerId}`),
    [page, status, providerId, customerId]
  );

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (status !== "all") p.set("status", status);
      if (providerId) p.set("provider_id", providerId);
      if (customerId) p.set("customer_id", customerId);
      return adminApi.getJson<ReviewsPayload>(`/api/admin/reviews?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.reviews ?? [];
  const pag = q.data?.pagination;
  const stats = q.data?.statistics;

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    n.set("page", "1");
    setSp(n, { replace: true });
  }

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    n.set("page", String(next));
    setSp(n, { replace: true });
  }

  function clearEntityFilters() {
    const n = new URLSearchParams(sp);
    n.delete("provider_id");
    n.delete("customer_id");
    n.set("page", "1");
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Reviews" />
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

  const tabs = ["all", "visible", "hidden", "flagged"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reviews & ratings"
        description="Customer→provider stars (`rating`), provider→customer (`customer_rating`), and staff rating per review. Superadmin has access via Providers & operations."
      />
      {stats ? (
        <AdminPanel>
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-gray-500">Total reviews</dt>
              <dd className="font-medium tabular-nums">{String(stats.total ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Average (customer→provider)</dt>
              <dd className="font-medium tabular-nums">{String(stats.average_rating ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Visible / hidden / flagged</dt>
              <dd className="font-medium">
                {String(stats.visible ?? "—")} / {String(stats.hidden ?? "—")} / {String(stats.flagged ?? "—")}
              </dd>
            </div>
          </dl>
        </AdminPanel>
      ) : null}
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => setStatus(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {(providerId || customerId) && (
          <p className="mt-3 text-sm text-gray-600">
            Filtered
            {providerId ? (
              <>
                {" "}
                · provider <span className="font-mono text-xs">{providerId}</span>
              </>
            ) : null}
            {customerId ? (
              <>
                {" "}
                · customer <span className="font-mono text-xs">{customerId}</span>
              </>
            ) : null}
            <button type="button" className="ml-2 text-primary underline" onClick={clearEntityFilters}>
              Clear
            </button>
          </p>
        )}
        {pag ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {pag.page} of {Math.max(1, pag.total_pages)} · {pag.total} total
          </p>
        ) : null}
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No reviews" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Customer→provider</AdminTh>
              <AdminTh>Provider→customer</AdminTh>
              <AdminTh>Staff</AdminTh>
              <AdminTh>Comment</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Visible</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const prov = row.provider as { id?: string; business_name?: string } | undefined;
              const cust = row.customer as { id?: string; full_name?: string; email?: string } | undefined;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="tabular-nums font-medium">{String(row.rating ?? "—")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.customer_rating ?? "—")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.staff_rating ?? "—")}</AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs">{String(row.comment ?? "")}</AdminTd>
                  <AdminTd className="text-xs">
                    {prov?.id ? (
                      <Link className="text-primary underline" to={adminSpaTo(`/admin/providers/${prov.id}`)}>
                        {String(prov.business_name ?? prov.id)}
                      </Link>
                    ) : (
                      String(prov?.business_name ?? "")
                    )}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {cust?.id ? (
                      <Link className="text-primary underline" to={adminSpaTo(`/admin/users/${cust.id}`)}>
                        {String(cust.full_name ?? cust.email ?? cust.id)}
                      </Link>
                    ) : (
                      String(cust?.full_name ?? cust?.email ?? "")
                    )}
                  </AdminTd>
                  <AdminTd>{String(row.is_visible ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {pag && pag.total_pages > 1 ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= pag.total_pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
