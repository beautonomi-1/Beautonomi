import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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

type RefundsPayload = {
  refunds: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  statistics: Record<string, unknown>;
};

export function RefundsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "all";
  const filters = useMemo(() => ({ page, status }), [page, status]);

  const q = useQuery({
    queryKey: adminQueryKeys.refunds(filters),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (status !== "all") p.set("status", status);
      return adminApi.getJson<RefundsPayload>(`/api/admin/refunds?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.refunds ?? [];
  const pag = q.data?.pagination;

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

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Refunds" />
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

  const tabs = ["all", "success", "pending", "failed", "refunded", "partially_refunded"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Refunds" description="GET /api/admin/refunds" />
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
        {pag ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {pag.page} of {Math.max(1, pag.total_pages)} · {pag.total} total
          </p>
        ) : null}
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No refund rows" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Status</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Refund</AdminTh>
              <AdminTh>Booking</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const booking = row.booking as { booking_number?: string } | null | undefined;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd>{String(row.status ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.amount ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.refund_amount ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(booking?.booking_number ?? "—")}</AdminTd>
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
