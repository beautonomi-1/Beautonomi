import { Link, useSearchParams } from "react-router";
import { useMemo } from "react";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";

type OverviewPayload = {
  order_summary?: {
    total_orders?: number;
    total_revenue_paid?: number;
    pending?: number;
    by_status?: Record<string, number>;
    by_payment_status?: Record<string, number>;
  };
  products_summary?: {
    total_products?: number;
    variant_skus?: number;
    /** @deprecated */
    total_skus?: number;
    active?: number;
    retail_enabled?: number;
    inactive?: number;
    products_with_variants?: number;
  };
  returns_summary?: { total?: number; pending?: number; escalated?: number };
  recent_orders?: Record<string, unknown>[];
  period?: { start_date?: string | null; end_date?: string | null } | null;
};

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive range: last N calendar days including today */
function presetInclusiveDays(n: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (n - 1));
  return { start: ymdLocal(start), end: ymdLocal(end) };
}

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
  const [sp, setSp] = useSearchParams();
  const startDate = sp.get("start_date")?.trim() ?? "";
  const endDate = sp.get("end_date")?.trim() ?? "";

  const periodKey = useMemo(() => {
    if (startDate && endDate) return `${startDate}|${endDate}`;
    return "all";
  }, [startDate, endDate]);

  const overviewQs = useMemo(() => {
    const p = new URLSearchParams();
    if (startDate) p.set("start_date", startDate);
    if (endDate) p.set("end_date", endDate);
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }, [startDate, endDate]);

  const q = useQuery({
    queryKey: adminQueryKeys.ecommerceOverview(periodKey),
    queryFn: () =>
      adminApi.getJson<OverviewPayload>(`/api/admin/ecommerce/overview${overviewQs}`, { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  function setPeriod(start: string, end: string) {
    const n = new URLSearchParams(sp);
    if (start && end) {
      n.set("start_date", start);
      n.set("end_date", end);
    } else {
      n.delete("start_date");
      n.delete("end_date");
    }
    setSp(n, { replace: true });
  }

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
  const periodActive = Boolean(startDate && endDate);
  const periodLabel = periodActive ? `${startDate} → ${endDate}` : "All time";
  const productCount = ps.total_products ?? ps.total_skus ?? 0;
  const variantSkuCount = ps.variant_skus ?? 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="E-commerce overview"
        description={`Tenant snapshot · Orders, returns & recent activity respect the date range. Catalog counts are always current. · ${periodLabel}`}
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

      <AdminPanel className="!p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Time period</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Filter order metrics, return counts, and recent orders. Dates are interpreted as UTC calendar days (same as finance exports).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              onClick={() => setPeriod("", "")}
            >
              All time
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              onClick={() => {
                const r = presetInclusiveDays(7);
                setPeriod(r.start, r.end);
              }}
            >
              Last 7 days
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              onClick={() => {
                const r = presetInclusiveDays(30);
                setPeriod(r.start, r.end);
              }}
            >
              Last 30 days
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              onClick={() => {
                const r = presetInclusiveDays(90);
                setPeriod(r.start, r.end);
              }}
            >
              Last 90 days
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-[10rem] flex-1 flex-col text-xs font-medium text-gray-600">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                const n = new URLSearchParams(sp);
                if (v) n.set("start_date", v);
                else n.delete("start_date");
                setSp(n, { replace: true });
              }}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col text-xs font-medium text-gray-600">
            End
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                const v = e.target.value;
                const n = new URLSearchParams(sp);
                if (v) n.set("end_date", v);
                else n.delete("end_date");
                setSp(n, { replace: true });
              }}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
          {periodActive ? (
            <button type="button" className="text-sm font-medium text-gray-600 underline hover:text-gray-900" onClick={() => setPeriod("", "")}>
              Clear range
            </button>
          ) : null}
        </div>
      </AdminPanel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label={periodActive ? "Product orders (in period)" : "Product orders"}
          value={String(os.total_orders ?? 0)}
        />
        <StatCard
          label={periodActive ? "Paid revenue (orders, period)" : "Paid revenue (orders)"}
          value={`ZAR ${Number(os.total_revenue_paid ?? 0).toFixed(2)}`}
        />
        <StatCard
          label={periodActive ? "Pending orders (in period)" : "Pending orders"}
          value={String(os.pending ?? 0)}
        />
        <StatCard
          label="Products"
          value={String(productCount)}
        />
        <StatCard label="Variant SKUs" value={String(variantSkuCount)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="text-lg font-semibold text-gray-900">
            Orders — status mix{periodActive ? " (selected period)" : ""}
          </h2>
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
          <p className="mt-1 text-xs text-gray-500">
            Catalog figures are the current catalog (not filtered by period). Return counts below follow the selected period when set.
          </p>
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
              <dt className="text-gray-600">Inactive products</dt>
              <dd className="font-medium tabular-nums">{ps.inactive ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Products with variants</dt>
              <dd className="font-medium tabular-nums">{ps.products_with_variants ?? 0}</dd>
            </div>
            <div className="mt-4 flex justify-between gap-4 border-t border-gray-100 pt-4">
              <dt className="text-gray-600">Return requests (total){periodActive ? " — in period" : ""}</dt>
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
        <h2 className="text-lg font-semibold text-gray-900">
          Recent orders{periodActive ? " (in period, up to 8)" : " (up to 8)"}
        </h2>
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
