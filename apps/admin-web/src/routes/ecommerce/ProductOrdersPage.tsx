import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
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
import { adminSpaTo } from "@/lib/adminSpaPath";

type OrderRow = Record<string, unknown> & {
  id?: string;
  order_number?: string;
  status?: string;
  payment_status?: string;
  fulfillment_type?: string;
  total_amount?: number;
  created_at?: string;
  customer?: { full_name?: string; email?: string; phone?: string } | null;
  provider?: { business_name?: string; id?: string } | null;
};

type OrdersPayload = {
  orders: OrderRow[];
  summary?: {
    total_orders?: number;
    total_revenue?: number;
    pending?: number;
    delivered?: number;
    cancelled?: number;
    paid_payment_count?: number;
    pending_payment_count?: number;
    by_status?: Record<string, number>;
    by_payment_status?: Record<string, number>;
  };
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};

const STATUS_OPTS = [
  "",
  "pending",
  "confirmed",
  "processing",
  "ready_for_collection",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

const PAYMENT_OPTS = ["", "pending", "paid", "failed", "refunded"] as const;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export function ProductOrdersPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E-commerce access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "";
  const paymentStatus = sp.get("payment_status") || "";
  const qk = useMemo(() => `${page}|${status}|${paymentStatus}`, [page, status, paymentStatus]);

  const q = useQuery({
    queryKey: adminQueryKeys.productOrders(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "20");
      if (status) p.set("status", status);
      if (paymentStatus) p.set("payment_status", paymentStatus);
      return adminApi.getJson<OrdersPayload>(`/api/admin/product-orders?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.orders ?? [];
  const pag = q.data?.pagination;
  const summary = q.data?.summary;

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
        <AdminPageHeader title="Product orders" />
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
      <AdminPageHeader
        title="Product orders"
        description="Tenant-scoped e-commerce orders with line items on the detail view."
        actions={
          <Link
            to={adminSpaTo("/admin/ecommerce")}
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
          >
            E-commerce overview
          </Link>
        }
      />

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total orders", String(summary.total_orders ?? 0)],
            ["Paid revenue (ZAR)", Number(summary.total_revenue ?? 0).toFixed(2)],
            ["Pending fulfillment", String(summary.pending ?? 0)],
            ["Paid (payment)", String(summary.paid_payment_count ?? 0)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.04]"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <AdminPanel>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm text-gray-600">
            Status{" "}
            <select
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
              value={status}
              onChange={(e) => patchParams({ status: e.target.value || null, page: "1" })}
            >
              {STATUS_OPTS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "All"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-600">
            Payment{" "}
            <select
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
              value={paymentStatus}
              onChange={(e) => patchParams({ payment_status: e.target.value || null, page: "1" })}
            >
              {PAYMENT_OPTS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "All"}
                </option>
              ))}
            </select>
          </label>
        </div>
        {summary?.by_status && Object.keys(summary.by_status).length > 0 ? (
          <p className="mt-3 text-xs text-gray-500">
            By status:{" "}
            {Object.entries(summary.by_status)
              .map(([k, v]) => `${k}=${v}`)
              .join(" · ")}
          </p>
        ) : null}
      </AdminPanel>

      {rows.length === 0 ? (
        <EmptyState title="No orders" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Order</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Fulfillment</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Payment</AdminTh>
              <AdminTh>Total</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((o) => {
              const oid = str(o.id);
              return (
                <tr key={oid}>
                  <AdminTd>
                    <Link
                      className="font-mono text-xs font-medium text-primary underline"
                      to={adminSpaTo(`/admin/ecommerce/orders/${encodeURIComponent(oid)}`)}
                    >
                      {String(o.order_number ?? oid)}
                    </Link>
                  </AdminTd>
                  <AdminTd>
                    <div>{String(o.customer?.full_name ?? "")}</div>
                    <div className="text-xs text-gray-500">{String(o.customer?.email ?? "")}</div>
                  </AdminTd>
                  <AdminTd>{String(o.provider?.business_name ?? "")}</AdminTd>
                  <AdminTd>{String(o.fulfillment_type ?? "")}</AdminTd>
                  <AdminTd>{String(o.status ?? "")}</AdminTd>
                  <AdminTd>{String(o.payment_status ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{Number(o.total_amount ?? 0).toFixed(2)}</AdminTd>
                </tr>
              );
            })}
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
