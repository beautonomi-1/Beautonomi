import { useMemo } from "react";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
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
import { adminToast } from "@/lib/adminToast";

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

type SubRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  billing_period?: string;
  started_at?: string;
  expires_at?: string;
  created_at?: string;
  providers?: { business_name?: string } | null;
  subscription_plans?: { name?: string } | null;
};

const SUB_STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  trial: "bg-blue-100 text-blue-800",
  past_due: "bg-amber-100 text-amber-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export function BillingPage() {
  useAdminDocumentTitle("Billing");
  const { allowed, denied } = useSuperadminPage(
    "Platform billing is restricted to superadmins (matches Next.js /admin/billing).",
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "";
  const subStatus = sp.get("sub_status") || "active";
  const qKey = useMemo(() => `${page}|${status}`, [page, status]);
  const subQk = useMemo(() => `billing|sub_status=${subStatus}`, [subStatus]);

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

  const subsQuery = useQuery({
    queryKey: adminQueryKeys.providerSubscriptions(subQk),
    staleTime: 0,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (subStatus !== "all") p.set("status", subStatus);
      const qs = p.toString();
      return adminApi.getJson<SubRow[] | { subscriptions?: SubRow[] }>(
        `/api/admin/provider-subscriptions${qs ? `?${qs}` : ""}`,
        { timeoutMs: 60_000 },
      );
    },
    enabled: allowed,
  });

  const overrideStatusMut = useMutation({
    mutationFn: ({ subId, newStatus }: { subId: string; newStatus: string }) =>
      adminApi.patchJson<unknown>(`/api/admin/provider-subscriptions/${subId}`, { status: newStatus }),
    onSuccess: async () => {
      adminToast.success("Subscription status updated");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providerSubscriptions(subQk) });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update status"),
  });

  const rows = q.data?.invoices ?? [];
  const subRows = Array.isArray(subsQuery.data)
    ? subsQuery.data
    : ((subsQuery.data as { subscriptions?: SubRow[] })?.subscriptions ?? []);

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
        <AdminPageHeader title="Billing" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const totalPages = q.data?.total_pages ?? 1;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Billing" description="Invoices and provider subscription management." />

      {/* Invoices section */}
      <AdminPanel>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Invoices</h3>
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

      {/* Provider subscriptions section */}
      <AdminPanel>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Provider subscriptions</h3>
          <label className="text-sm text-gray-600">
            Status{" "}
            <select
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
              value={subStatus}
              onChange={(e) => {
                const n = new URLSearchParams(sp);
                n.set("sub_status", e.target.value);
                setSp(n, { replace: true });
              }}
            >
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="trial">trial</option>
              <option value="expired">expired</option>
              <option value="cancelled">cancelled</option>
              <option value="past_due">past_due</option>
            </select>
          </label>
        </div>
      </AdminPanel>
      {subsQuery.isLoading ? (
        <AdminPanel><AdminPageSkeleton rows={3} /></AdminPanel>
      ) : subsQuery.error ? (
        <AdminPanel>
          <AdminRetryBlock message={(subsQuery.error as Error).message} onRetry={() => void subsQuery.refetch()} />
        </AdminPanel>
      ) : subRows.length === 0 ? (
        <EmptyState title="No subscriptions" description={`No provider subscriptions with status "${subStatus}".`} />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Plan</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Period</AdminTh>
              <AdminTh>Started</AdminTh>
              <AdminTh>Expires</AdminTh>
              <AdminTh>Override</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {subRows.map((r) => {
              const sid = String(r.id ?? "");
              return (
                <tr key={sid}>
                  <AdminTd className="font-medium">{String(r.providers?.business_name ?? "—")}</AdminTd>
                  <AdminTd>{String(r.subscription_plans?.name ?? "—")}</AdminTd>
                  <AdminTd>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SUB_STATUS_BADGE[String(r.status ?? "")] ?? "bg-gray-100 text-gray-600"}`}>
                      {String(r.status ?? "")}
                    </span>
                  </AdminTd>
                  <AdminTd>{String(r.billing_period ?? "—")}</AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {r.started_at ? new Date(r.started_at).toLocaleDateString() : r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "—"}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      {(r.status === "expired" || r.status === "past_due" || r.status === "cancelled") && (
                        <button
                          type="button"
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                          disabled={overrideStatusMut.isPending}
                          onClick={() => {
                            if (confirm(`Reactivate subscription for ${r.providers?.business_name ?? "this provider"}?`)) {
                              overrideStatusMut.mutate({ subId: sid, newStatus: "active" });
                            }
                          }}
                        >
                          Reactivate
                        </button>
                      )}
                      {r.status === "active" && (
                        <button
                          type="button"
                          className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                          disabled={overrideStatusMut.isPending}
                          onClick={() => {
                            if (confirm(`Cancel subscription for ${r.providers?.business_name ?? "this provider"}?`)) {
                              overrideStatusMut.mutate({ subId: sid, newStatus: "cancelled" });
                            }
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
