import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { adminSpaTo } from "@/lib/adminSpaPath";

type OverviewPayload = {
  order_summary?: {
    total_orders?: number;
    total_revenue_paid?: number;
    pending?: number;
    by_status?: Record<string, number>;
    by_payment_status?: Record<string, number>;
  };
  products_summary?: {
    total_skus?: number;
    active?: number;
    retail_enabled?: number;
    inactive?: number;
  };
  returns_summary?: { total?: number; pending?: number; escalated?: number };
  recent_orders?: Record<string, unknown>[];
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.04]">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

export function EcommerceOverviewPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E-commerce access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.ecommerceOverview(),
    queryFn: () => adminApi.getJson<OverviewPayload>("/api/admin/ecommerce/overview", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="E-commerce" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;
  const os = d?.order_summary ?? {};
  const ps = d?.products_summary ?? {};
  const rs = d?.returns_summary ?? {};
  const recent = d?.recent_orders ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="E-commerce overview"
        description="Tenant-scoped snapshot: orders, catalog, and returns."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={adminSpaTo("/admin/ecommerce/orders")}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
            >
              All orders
            </Link>
            <Link
              to={adminSpaTo("/admin/ecommerce/products")}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
            >
              Product catalog
            </Link>
            <Link
              to={adminSpaTo("/admin/ecommerce/returns")}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
            >
              Returns
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Product orders" value={String(os.total_orders ?? 0)} />
        <StatCard
          label="Paid revenue (orders)"
          value={`ZAR ${Number(os.total_revenue_paid ?? 0).toFixed(2)}`}
        />
        <StatCard label="Pending orders" value={String(os.pending ?? 0)} />
        <StatCard label="Product SKUs" value={String(ps.total_skus ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Orders — status mix</h2>
          <ul className="mt-3 space-y-1 text-sm text-gray-700">
            {Object.entries(os.by_status ?? {}).length === 0 ? (
              <li className="text-gray-500">No orders yet.</li>
            ) : (
              Object.entries(os.by_status ?? {}).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-4">
                  <span>{k}</span>
                  <span className="tabular-nums font-medium">{v}</span>
                </li>
              ))
            )}
          </ul>
          <h3 className="mt-6 text-sm font-semibold text-gray-900">Payment status</h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {Object.entries(os.by_payment_status ?? {}).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-4">
                <span>{k}</span>
                <span className="tabular-nums font-medium">{v}</span>
              </li>
            ))}
          </ul>
        </AdminPanel>

        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">Catalog & returns</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Active products</dt>
              <dd className="font-medium tabular-nums">{ps.active ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Retail-enabled</dt>
              <dd className="font-medium tabular-nums">{ps.retail_enabled ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Inactive SKUs</dt>
              <dd className="font-medium tabular-nums">{ps.inactive ?? 0}</dd>
            </div>
            <div className="mt-4 flex justify-between gap-4 border-t border-gray-100 pt-4">
              <dt className="text-gray-600">Return requests (total)</dt>
              <dd className="font-medium tabular-nums">{rs.total ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Returns pending</dt>
              <dd className="font-medium tabular-nums">{rs.pending ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Returns escalated</dt>
              <dd className="font-medium tabular-nums">{rs.escalated ?? 0}</dd>
            </div>
          </dl>
        </AdminPanel>
      </div>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Recent orders</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No recent orders.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Order</AdminTh>
                <AdminTh>Customer</AdminTh>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Payment</AdminTh>
                <AdminTh>Total</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {recent.map((o, idx) => {
                const id = str(o.id);
                const cust = o.customer as { full_name?: string; email?: string } | undefined;
                const prov = o.provider as { business_name?: string } | undefined;
                return (
                  <tr key={id || `recent-${idx}`}>
                    <AdminTd>
                      <Link className="font-mono text-xs text-primary underline" to={adminSpaTo(`/admin/ecommerce/orders/${id}`)}>
                        {str(o.order_number ?? id)}
                      </Link>
                    </AdminTd>
                    <AdminTd>{cust?.full_name || cust?.email || "—"}</AdminTd>
                    <AdminTd>{prov?.business_name || "—"}</AdminTd>
                    <AdminTd>{str(o.status)}</AdminTd>
                    <AdminTd>{str(o.payment_status)}</AdminTd>
                    <AdminTd className="tabular-nums">{Number(o.total_amount ?? 0).toFixed(2)}</AdminTd>
                  </tr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
