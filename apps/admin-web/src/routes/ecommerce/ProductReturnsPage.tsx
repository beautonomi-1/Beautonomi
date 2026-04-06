import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
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
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

type ReturnRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  customer?: { full_name?: string } | null;
  order?: { order_number?: string } | null;
};

type ReturnsPayload = {
  returns: ReturnRow[];
  summary?: Record<string, number>;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};

export function ProductReturnsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E-commerce access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "";
  const qk = useMemo(() => `${page}|${status}`, [page, status]);

  const q = useQuery({
    queryKey: adminQueryKeys.productReturns(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "20");
      if (status) p.set("status", status);
      return adminApi.getJson<ReturnsPayload>(`/api/admin/product-returns?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.returns ?? [];
  const pag = q.data?.pagination;

  function patchParams(u: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Product returns" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Product returns" description="GET /api/admin/product-returns" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/ecommerce/returns")} className="font-medium text-gray-900 underline">
          Legacy returns →
        </a>
      </p>
      <AdminPanel>
        <label className="text-sm text-gray-600">
          Status{" "}
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => patchParams({ status: e.target.value || null, page: "1" })}
          >
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="escalated">escalated</option>
            <option value="refunded">refunded</option>
          </select>
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No returns" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Order</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Status</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-mono text-xs">{String(r.order?.order_number ?? "")}</AdminTd>
                <AdminTd>{String(r.customer?.full_name ?? "")}</AdminTd>
                <AdminTd>{String(r.status ?? "")}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {pag && pag.totalPages > 1 ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => patchParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= pag.totalPages}
            onClick={() => patchParams({ page: String(page + 1) })}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
