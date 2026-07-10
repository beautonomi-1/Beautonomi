import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { formatPaycloudMerchantOptionLabel } from "@/lib/formatPaycloudMerchantLabel";

type PaycloudProvider = {
  id?: string;
  business_name?: string | null;
  slug?: string | null;
};

type PaycloudTerminalRow = {
  id: string;
  display_name: string;
  terminal_sn: string;
  status: string;
  is_active: boolean;
  provider_id: string | null;
  in_flight_payment_id: string | null;
  last_used_at: string | null;
  last_error: string | null;
  provider?: PaycloudProvider | null;
  merchant?: {
    id: string;
    label: string;
    merchant_no: string;
    store_no: string;
    environment: string;
  } | null;
  location?: { id: string; name: string } | null;
};

type PaycloudPayment = {
  id: string;
  provider_id: string;
  terminal_id?: string | null;
  merchant_order_no: string;
  paycloud_order_id?: string | null;
  trans_status?: string | null;
  amount: number;
  expected_amount: number;
  tip_amount?: number | null;
  cashback_amount?: number | null;
  currency: string;
  amount_match_status: string;
  status: string;
  environment: string;
  entity_type: string;
  entity_id: string;
  pay_scenario?: string | null;
  error_message?: string | null;
  response_code?: string | null;
  created_at: string;
  provider?: PaycloudProvider | null;
  terminal?: Pick<PaycloudTerminalRow, "display_name" | "terminal_sn"> | null;
};

type PaycloudPaymentsResponse = {
  items: PaycloudPayment[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

type PaycloudFleetSummary = {
  total: number;
  active: number;
  in_stock: number;
  assigned: number;
  suspended: number;
  unassigned: number;
};

type PaycloudTerminalsResponse = {
  items: PaycloudTerminalRow[];
  total: number;
  summary: PaycloudFleetSummary;
};

function money(amount: number | string | null | undefined, currency = "ZAR") {
  return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (["successful", "exact", "active", "assigned"].includes(s)) {
    return "bg-emerald-100 text-emerald-900";
  }
  if (["pending", "processing", "under", "over", "mismatch", "in_stock"].includes(s)) {
    return "bg-amber-100 text-amber-900";
  }
  if (["failed", "cancelled", "closed", "suspended"].includes(s)) {
    return "bg-red-100 text-red-900";
  }
  return "bg-gray-100 text-gray-800";
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusClass(value))}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function providerLink(provider?: PaycloudProvider | null) {
  if (!provider?.id) return <span className="text-gray-500">Unknown provider</span>;
  return (
    <Link
      to={adminSpaTo(`/admin/providers/${encodeURIComponent(provider.id)}`)}
      className="font-medium text-gray-900 underline-offset-2 hover:underline"
    >
      {provider.business_name || provider.id}
    </Link>
  );
}

function buildPaymentsQuery(filters: {
  search: string;
  status: string;
  environment: string;
  exceptionsOnly: boolean;
  offset: number;
}) {
  const params = new URLSearchParams();
  params.set("limit", "50");
  params.set("offset", String(filters.offset));
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.environment) params.set("environment", filters.environment);
  if (filters.exceptionsOnly) params.set("exceptions_only", "true");
  return params.toString();
}

export function PayCloudOperationsPage() {
  useAdminDocumentTitle("PayCloud Operations");
  const { allowed, denied } = useSuperadminPage("PayCloud operations console is superadmin-only.");
  void allowed;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [environment, setEnvironment] = useState("");
  const [exceptionsOnly, setExceptionsOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<PaycloudTerminalRow | null>(null);
  const [reassignForm, setReassignForm] = useState({
    provider_id: "",
    paycloud_merchant_id: "",
  });
  const [assignForm, setAssignForm] = useState({
    provider_id: "",
    paycloud_merchant_id: "",
    terminal_sn: "",
    display_name: "",
  });

  const filterSignature = useMemo(
    () => buildPaymentsQuery({ search, status, environment, exceptionsOnly, offset }),
    [search, status, environment, exceptionsOnly, offset],
  );

  const paymentsQ = useQuery({
    queryKey: adminQueryKeys.paycloudOperations.payments(filterSignature),
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<PaycloudPaymentsResponse>(
        `/api/admin/paycloud-operations/payments?${filterSignature}`,
        { timeoutMs: 30_000 },
      ),
  });

  const fleetQ = useQuery({
    queryKey: adminQueryKeys.paycloudOperations.terminals("fleet-50"),
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<PaycloudTerminalsResponse>("/api/admin/paycloud-operations/terminals?limit=50", {
        timeoutMs: 30_000,
      }),
  });

  const summaryQ = useQuery({
    queryKey: adminQueryKeys.paycloudOperations.terminalsSummary(),
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<PaycloudTerminalsResponse>("/api/admin/paycloud-operations/terminals?limit=1", {
        timeoutMs: 30_000,
      }),
  });

  const merchantsQ = useQuery({
    queryKey: adminQueryKeys.paycloudOperations.merchants(),
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<{
        items: Array<{
          id: string;
          label: string;
          merchant_no: string;
          store_no: string;
          environment: string;
        }>;
      }>("/api/admin/paycloud-operations/merchants?limit=100", {
        timeoutMs: 30_000,
      }),
  });

  const runReconcileMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<{ payment_count: number }>("/api/admin/paycloud-operations/reconcile", {}),
    onSuccess: async (data) => {
      adminToast.success(`Reconcile ran for ${data.payment_count ?? 0} pending payments`);
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.all() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const assignTerminalMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson("/api/admin/paycloud-operations/terminals", body),
    onSuccess: async () => {
      adminToast.success("Terminal assigned");
      setAssignForm({ provider_id: "", paycloud_merchant_id: "", terminal_sn: "", display_name: "" });
      setShowAssignForm(false);
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.all() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const forceSettleMut = useMutation({
    mutationFn: (paymentId: string) =>
      adminApi.postJson<{ settled: boolean; reason?: string | null }>(
        `/api/admin/paycloud-operations/payments/${encodeURIComponent(paymentId)}/force-settle`,
        {},
      ),
    onSuccess: async (data) => {
      if (data.settled) {
        adminToast.success(data.reason ? `Payment settled (${data.reason})` : "Payment force-settled");
      } else {
        adminToast.error(data.reason ? `Settlement skipped: ${data.reason}` : "Settlement did not complete");
      }
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.all() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const payments = paymentsQ.data?.items ?? [];
  const total = paymentsQ.data?.total ?? 0;
  const hasMore = paymentsQ.data?.hasMore ?? false;
  const fleet = summaryQ.data?.summary;
  const fleetItems = fleetQ.data?.items ?? [];

  const terminalActionMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson("/api/admin/paycloud-operations/terminals", body),
    onSuccess: async () => {
      adminToast.success("Terminal updated");
      setReassignTarget(null);
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.all() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (paymentsQ.isLoading && summaryQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="PayCloud Operations" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (paymentsQ.error) {
    if (isAdminApiAuthFailure(paymentsQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={paymentsQ.error.message} onRetry={() => void paymentsQ.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="PayCloud Operations"
        description="Search in-person card machine payments, review amount exceptions, and manage the terminal fleet."
        actions={
          <>
            <button
              type="button"
              className={adminToolbarButtonClass(runReconcileMut.isPending)}
              disabled={runReconcileMut.isPending}
              onClick={() => runReconcileMut.mutate()}
            >
              {runReconcileMut.isPending ? "Reconciling…" : "Run reconcile now"}
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(paymentsQ.isFetching || summaryQ.isFetching || fleetQ.isFetching)}
              disabled={paymentsQ.isFetching || summaryQ.isFetching || fleetQ.isFetching}
              onClick={() => {
                void paymentsQ.refetch();
                void summaryQ.refetch();
                void fleetQ.refetch();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {paymentsQ.isFetching || summaryQ.isFetching || fleetQ.isFetching ? "Refreshing" : "Refresh"}
            </button>
          </>
        }
      />
      <AdminMutationAlert
        errors={[
          forceSettleMut.error instanceof Error ? forceSettleMut.error : null,
          runReconcileMut.error instanceof Error ? runReconcileMut.error : null,
          assignTerminalMut.error instanceof Error ? assignTerminalMut.error : null,
        ]}
      />

      <AdminPanel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Terminal fleet</h2>
              {fleetQ.isLoading && summaryQ.isLoading ? (
                <p className="mt-1 text-sm text-gray-500">Loading fleet summary…</p>
              ) : fleet ? (
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Total</dt>
                    <dd className="font-medium">{fleet.total}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Active</dt>
                    <dd className="font-medium">{fleet.active}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Assigned</dt>
                    <dd className="font-medium">{fleet.assigned}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">In stock</dt>
                    <dd className="font-medium">{fleet.in_stock}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Suspended</dt>
                    <dd className="font-medium">{fleet.suspended}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Unassigned</dt>
                    <dd className="font-medium">{fleet.unassigned}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-1 text-sm text-gray-500">No fleet data available.</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              onClick={() => setShowAssignForm((v) => !v)}
            >
              {showAssignForm ? "Hide assign form" : "Assign terminal"}
            </button>
            <Link
              to={adminSpaTo("/admin/integrations/paycloud")}
              className={adminToolbarButtonClass(false) + " inline-flex items-center gap-2"}
            >
              Platform credentials
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {showAssignForm ? (
          <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Provider ID</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={assignForm.provider_id}
                onChange={(e) => setAssignForm((f) => ({ ...f, provider_id: e.target.value }))}
                placeholder="UUID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Merchant</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={assignForm.paycloud_merchant_id}
                onChange={(e) => setAssignForm((f) => ({ ...f, paycloud_merchant_id: e.target.value }))}
              >
                <option value="">Select merchant…</option>
                {(merchantsQ.data?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {formatPaycloudMerchantOptionLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Serial number</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                value={assignForm.terminal_sn}
                onChange={(e) => setAssignForm((f) => ({ ...f, terminal_sn: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Display name</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={assignForm.display_name}
                onChange={(e) => setAssignForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                className={adminToolbarButtonClass(assignTerminalMut.isPending)}
                disabled={
                  assignTerminalMut.isPending ||
                  !assignForm.provider_id.trim() ||
                  !assignForm.paycloud_merchant_id ||
                  !assignForm.terminal_sn.trim() ||
                  !assignForm.display_name.trim()
                }
                onClick={() =>
                  assignTerminalMut.mutate({
                    provider_id: assignForm.provider_id.trim(),
                    paycloud_merchant_id: assignForm.paycloud_merchant_id,
                    terminal_sn: assignForm.terminal_sn.trim(),
                    display_name: assignForm.display_name.trim(),
                  })
                }
              >
                {assignTerminalMut.isPending ? "Assigning…" : "Assign to provider"}
              </button>
            </div>
          </div>
        ) : null}
        {summaryQ.error ? (
          <p className="mt-3 text-sm text-amber-700">
            Fleet summary unavailable: {(summaryQ.error as Error).message}
          </p>
        ) : null}

        {fleetItems.length > 0 ? (
          <AdminDataTable className="mt-6">
            <AdminTableHead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Serial</AdminTh>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Merchant</AdminTh>
                <AdminTh>Location</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {fleetItems.map((t) => (
                <tr key={t.id}>
                  <AdminTd>{t.display_name}</AdminTd>
                  <AdminTd className="font-mono text-xs">{t.terminal_sn}</AdminTd>
                  <AdminTd>{providerLink(t.provider)}</AdminTd>
                  <AdminTd>
                    {t.merchant ? (
                      <div className="text-xs">
                        <div>{t.merchant.label}</div>
                        <div className="font-mono text-gray-500">
                          {t.merchant.merchant_no} / {t.merchant.store_no}
                        </div>
                      </div>
                    ) : (
                      <span className="text-amber-700">No merchant</span>
                    )}
                  </AdminTd>
                  <AdminTd>{t.location?.name ?? (t.location === null ? "Portable" : "—")}</AdminTd>
                  <AdminTd>
                    <StatusBadge value={t.status} />
                    {t.in_flight_payment_id ? (
                      <div className="mt-1 text-xs text-amber-700">In-flight payment</div>
                    ) : null}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      {t.status === "suspended" ? (
                        <button
                          type="button"
                          className="rounded border border-gray-200 px-2 py-1 text-xs"
                          disabled={terminalActionMut.isPending}
                          onClick={() =>
                            terminalActionMut.mutate({ action: "unsuspend", terminal_id: t.id })
                          }
                        >
                          Unsuspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded border border-gray-200 px-2 py-1 text-xs"
                          disabled={terminalActionMut.isPending}
                          onClick={() =>
                            terminalActionMut.mutate({ action: "suspend", terminal_id: t.id })
                          }
                        >
                          Suspend
                        </button>
                      )}
                      {t.provider_id ? (
                        <button
                          type="button"
                          className="rounded border border-gray-200 px-2 py-1 text-xs"
                          disabled={terminalActionMut.isPending}
                          onClick={() => {
                            if (window.confirm(`Unassign ${t.display_name} from provider?`)) {
                              terminalActionMut.mutate({ action: "unassign", terminal_id: t.id });
                            }
                          }}
                        >
                          Unassign
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded border border-gray-200 px-2 py-1 text-xs"
                        disabled={terminalActionMut.isPending}
                        onClick={() => {
                          setReassignTarget(t);
                          setReassignForm({
                            provider_id: t.provider_id ?? "",
                            paycloud_merchant_id: t.merchant?.id ?? "",
                          });
                        }}
                      >
                        Reassign
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        ) : fleetQ.isLoading ? (
          <p className="mt-4 text-sm text-gray-500">Loading terminals…</p>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No terminals in fleet"
              description="Register merchants and assign terminals from provider detail or POST assign API."
            />
          </div>
        )}

        {reassignTarget ? (
          <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Reassign {reassignTarget.display_name}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">Provider ID</label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono"
                  value={reassignForm.provider_id}
                  onChange={(e) =>
                    setReassignForm((f) => ({ ...f, provider_id: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Merchant</label>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  value={reassignForm.paycloud_merchant_id}
                  onChange={(e) =>
                    setReassignForm((f) => ({ ...f, paycloud_merchant_id: e.target.value }))
                  }
                >
                  <option value="">Select merchant…</option>
                  {(merchantsQ.data?.items ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {formatPaycloudMerchantOptionLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={adminToolbarButtonClass(terminalActionMut.isPending)}
                disabled={
                  terminalActionMut.isPending ||
                  !reassignForm.provider_id ||
                  !reassignForm.paycloud_merchant_id
                }
                onClick={() =>
                  terminalActionMut.mutate({
                    action: "reassign",
                    terminal_id: reassignTarget.id,
                    provider_id: reassignForm.provider_id,
                    paycloud_merchant_id: reassignForm.paycloud_merchant_id,
                  })
                }
              >
                Save reassignment
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
                onClick={() => setReassignTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Payment search</h2>
        <p className="mt-1 text-sm text-gray-600">
          Search PayCloud captures by order reference, provider, or linked entity. Use amount exceptions to
          surface under/over/mismatch payments that did not auto-settle.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Search</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Merchant order no, PayCloud order id, entity id"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="successful">Successful</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Environment</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={environment}
              onChange={(event) => {
                setEnvironment(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All environments</option>
              <option value="live">Live</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={exceptionsOnly}
            onChange={(event) => {
              setExceptionsOnly(event.target.checked);
              setOffset(0);
            }}
          />
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Amount exceptions only (not exact match)
          </span>
        </label>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            {total} payment{total === 1 ? "" : "s"}
            {exceptionsOnly ? " with amount exceptions" : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
              disabled={offset <= 0}
              onClick={() => setOffset((v) => Math.max(0, v - 50))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
              disabled={!hasMore}
              onClick={() => setOffset((v) => v + 50)}
            >
              Next
            </button>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No PayCloud payments found"
              description={
                exceptionsOnly
                  ? "No amount exceptions match your filters."
                  : "Try adjusting search or filter criteria."
              }
            />
          </div>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Created</AdminTh>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Terminal</AdminTh>
                <AdminTh>Order</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Expected</AdminTh>
                <AdminTh>Match</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Entity</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {payments.map((payment) => {
                const canForceSettle =
                  payment.status === "successful" && payment.amount_match_status !== "exact";
                return (
                  <tr key={payment.id}>
                    <AdminTd className="whitespace-nowrap text-xs text-gray-600">
                      {new Date(payment.created_at).toLocaleString()}
                    </AdminTd>
                    <AdminTd>{providerLink(payment.provider)}</AdminTd>
                    <AdminTd>
                      <div className="text-sm text-gray-900">
                        {payment.terminal?.display_name ?? "—"}
                      </div>
                      {payment.terminal?.terminal_sn ? (
                        <div className="text-xs text-gray-500">{payment.terminal.terminal_sn}</div>
                      ) : null}
                    </AdminTd>
                    <AdminTd>
                      <div className="font-mono text-xs">{payment.merchant_order_no}</div>
                      {payment.paycloud_order_id ? (
                        <div className="font-mono text-xs text-gray-500">{payment.paycloud_order_id}</div>
                      ) : null}
                    </AdminTd>
                    <AdminTd>{money(payment.amount, payment.currency)}</AdminTd>
                    <AdminTd>{money(payment.expected_amount, payment.currency)}</AdminTd>
                    <AdminTd>
                      <StatusBadge value={payment.amount_match_status} />
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={payment.status} />
                    </AdminTd>
                    <AdminTd>
                      <div className="text-xs text-gray-800">{payment.entity_type}</div>
                      <div className="font-mono text-xs text-gray-500">{payment.entity_id}</div>
                    </AdminTd>
                    <AdminTd>
                      {canForceSettle ? (
                        <button
                          type="button"
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          disabled={forceSettleMut.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Force-settle ${money(payment.amount, payment.currency)} for ${payment.entity_type} ${payment.entity_id}?`,
                              )
                            ) {
                              forceSettleMut.mutate(payment.id);
                            }
                          }}
                        >
                          Force settle
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </AdminTd>
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
