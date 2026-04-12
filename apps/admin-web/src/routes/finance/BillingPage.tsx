import { useMemo } from "react";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
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

type InvoiceRow = Record<string, unknown> & {
  id?: string;
  invoice_number?: string;
  status?: string;
  total_amount?: number;
  provider?: { name?: string; business_name?: string } | null;
};

type InvoicesPayload = {
  invoices: InvoiceRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

export function BillingPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "";
  const qKey = useMemo(() => `${page}|${status}`, [page, status]);

  const q = useQuery({
    queryKey: adminQueryKeys.billing.invoices(qKey),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "20");
      if (status) p.set("status", status);
      return adminApi.getJson<InvoicesPayload>(`/api/admin/invoices?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.invoices ?? [];

  function setPage(n: number) {
    const next = new URLSearchParams(sp);
    next.set("page", String(n));
    setSp(next, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Billing" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Billing" description="GET /api/admin/invoices" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const totalPages = q.data?.total_pages ?? 1;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Billing" description="GET /api/admin/invoices" />
      <AdminPanel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm text-gray-600">
            Status filter{" "}
            <select
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
              value={status}
              onChange={(e) => {
                const n = new URLSearchParams(sp);
                if (e.target.value) n.set("status", e.target.value);
                else n.delete("status");
                n.set("page", "1");
                setSp(n, { replace: true });
              }}
            >
              <option value="">All</option>
              <option value="draft">draft</option>
              <option value="sent">sent</option>
              <option value="paid">paid</option>
              <option value="overdue">overdue</option>
            </select>
          </label>
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No invoices" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Invoice</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Total</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((inv) => (
              <tr key={String(inv.id)}>
                <AdminTd className="font-medium">{String(inv.invoice_number ?? inv.id)}</AdminTd>
                <AdminTd>{String(inv.provider?.name ?? inv.provider?.business_name ?? "—")}</AdminTd>
                <AdminTd>{String(inv.status ?? "")}</AdminTd>
                <AdminTd className="tabular-nums">{formatAdminCurrency(Number(inv.total_amount ?? 0), String((inv as Record<string, unknown>).currency ?? "") || undefined)}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {totalPages > 1 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(page >= totalPages)}
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
