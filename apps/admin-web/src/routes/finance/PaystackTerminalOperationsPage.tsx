import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  PauseCircle,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

type AdminTerminalProvider = {
  id?: string;
  business_name?: string | null;
  tenant_id?: string | null;
};

type AdminTerminal = {
  id: string;
  provider_id: string;
  name: string;
  terminal_code: string;
  status: string;
  active: boolean;
  currency?: string | null;
  display_name?: string | null;
  payment_link?: string | null;
  terminal_url?: string | null;
  qr_url?: string | null;
  poster_url?: string | null;
  asset_status?: string | null;
  asset_request_status?: string | null;
  asset_last_requested_at?: string | null;
  asset_requested_by_provider_at?: string | null;
  destination_status?: string | null;
  identity_status?: string | null;
  notification_whatsapp?: string | null;
  notification_whatsapp_label?: string | null;
  paystack_dashboard_url?: string | null;
  business_snapshot?: Record<string, unknown> | null;
  last_payment_at?: string | null;
  created_at: string;
  provider?: AdminTerminalProvider | null;
};

type AdminTerminalPayment = {
  id: string;
  provider_id: string;
  paystack_reference: string;
  paid_amount: number;
  allocated_amount?: number | null;
  remaining_balance?: number | null;
  currency: string;
  allocation_status: string;
  payout_eligibility_status: string;
  amount_match_status: string;
  customer_reference?: string | null;
  suggested_entity_type?: string | null;
  suggested_entity_id?: string | null;
  provider_assigned_entity_type?: string | null;
  provider_assigned_entity_id?: string | null;
  provider_decline_reason?: string | null;
  created_at: string;
  provider?: AdminTerminalProvider | null;
  terminal?: { id?: string; name?: string | null; terminal_code?: string | null } | null;
};

type AdminTerminalSetupRequest = {
  id: string;
  provider_id: string;
  location_id?: string | null;
  status: string;
  requested_display_name: string;
  suggested_paystack_name: string;
  currency: string;
  destination_target?: string | null;
  destination_name?: string | null;
  destinations?: Array<{ target: string; name?: string | null }>;
  custom_fields?: Array<{ display_name: string; variable_name: string }>;
  metadata?: Record<string, unknown> | null;
  request_notes?: string | null;
  created_at: string;
  provider?: AdminTerminalProvider | null;
  location?: { id?: string; name?: string | null; city?: string | null } | null;
  requested_by_user?: { id?: string; email?: string | null; full_name?: string | null } | null;
};

type PaystackTerminalPayload = {
  terminals: AdminTerminal[];
  payments: AdminTerminalPayment[];
  setupRequests: AdminTerminalSetupRequest[];
  summary?: {
    total: number;
    active: number;
    missingPaymentLink: number;
    missingPoster: number;
    missingQr: number;
    missingWhatsappDestination: number;
    needsIdentityReview: number;
    requested: number;
    ready: number;
  };
};

type SyncTerminal = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  currency?: string | null;
  mapped: boolean;
  local_terminal_id?: string | null;
  suggested_matches?: Array<{
    provider: AdminTerminalProvider;
    confidence: number;
    reasons: string[];
  }>;
};

const QK = [...adminQueryKeys.finance.all(), "paystack-terminal"] as const;

async function invalidatePaystackTerminalQueries(
  qc: ReturnType<typeof useQueryClient>,
) {
  await qc.invalidateQueries({ queryKey: QK });
  void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
}

function money(amount: number | string | null | undefined, currency = "ZAR") {
  return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (["allocated", "admin_resolved", "eligible", "active", "exact_match", "ready", "completed"].includes(s)) {
    return "bg-emerald-100 text-emerald-900";
  }
  if (["held", "admin_review", "suggested", "partial_payment", "overpayment", "requested", "in_progress", "link_ready", "poster_ready"].includes(s)) {
    return "bg-amber-100 text-amber-900";
  }
  if (["provider_declined", "blocked", "disputed", "refunded", "inactive", "sync_error"].includes(s)) {
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

function providerLink(provider?: AdminTerminalProvider | null) {
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

function maskPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `ending ${digits.slice(-4)}` : "Not set";
}

function csrfHeader(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ? { "x-csrf-token": match[1] } : {};
}

async function uploadPoster(id: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(`/api/admin/paystack-terminal/terminals/${id}/poster`, {
    method: "POST",
    credentials: "include",
    headers: csrfHeader(),
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : typeof json?.message === "string"
          ? json.message
          : "Failed to upload poster";
    throw new Error(message);
  }
  return json;
}

export function PaystackTerminalOperationsPage() {
  useAdminDocumentTitle("Paystack Terminal Operations");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_FINANCE,
    "Finance access is required to manage Paystack Terminal operations.",
  );
  const qc = useQueryClient();
  const [tab, setTab] = useState<"exceptions" | "terminals" | "setup">("exceptions");
  const [tabInitialized, setTabInitialized] = useState(false);
  const [allocationStatus, setAllocationStatus] = useState("admin_review");
  const [setupFilter, setSetupFilter] = useState<"requested" | "needs_assets" | "ready" | "all">("requested");
  const [resolveFor, setResolveFor] = useState<AdminTerminalPayment | null>(null);
  const [assetFor, setAssetFor] = useState<AdminTerminal | null>(null);
  const [syncItems, setSyncItems] = useState<SyncTerminal[]>([]);
  const [assetForm, setAssetForm] = useState({
    payment_link: "",
    terminal_url: "",
    qr_url: "",
    poster_url: "",
    display_name: "",
    paystack_name: "",
    notification_whatsapp: "",
    notification_whatsapp_label: "",
    paystack_dashboard_url: "",
    asset_notes: "",
    identity_status: "verified",
  });
  const [resolveEntityType, setResolveEntityType] = useState("booking");
  const [resolveEntityId, setResolveEntityId] = useState("");
  const [resolveReason, setResolveReason] = useState("");
  const [importFor, setImportFor] = useState<SyncTerminal | null>(null);
  const [importForm, setImportForm] = useState({ provider_id: "", payment_link: "" });

  const q = useQuery({
    queryKey: [...QK, allocationStatus],
    enabled: allowed,
    queryFn: async (): Promise<PaystackTerminalPayload> => {
      const paymentQs = allocationStatus === "all" ? "" : `?allocation_status=${encodeURIComponent(allocationStatus)}`;
      const [terminalRes, paymentRes, setupRequestRes] = await Promise.all([
        adminApi.getJson<{ items: AdminTerminal[]; summary?: PaystackTerminalPayload["summary"] }>(
          "/api/admin/paystack-terminal/terminals?limit=100",
        ),
        adminApi.getJson<{ items: AdminTerminalPayment[] }>(
          `/api/admin/paystack-terminal/payments${paymentQs}${paymentQs ? "&" : "?"}limit=100`,
        ),
        adminApi.getJson<{ items: AdminTerminalSetupRequest[] }>(
          "/api/admin/paystack-terminal/setup-requests?status=all&limit=100",
        ),
      ]);
      return {
        terminals: terminalRes.items ?? [],
        payments: paymentRes.items ?? [],
        setupRequests: setupRequestRes.items ?? [],
        summary: terminalRes.summary,
      };
    },
  });

  useEffect(() => {
    if (tabInitialized || !q.data) return;
    const pendingSetup =
      (q.data.summary?.requested ?? 0) > 0 ||
      (q.data.setupRequests?.filter((r) => r.status === "requested" || r.status === "in_progress").length ?? 0) > 0;
    if (pendingSetup) setTab("setup");
    setTabInitialized(true);
  }, [q.data, tabInitialized]);

  const pendingSetupCount = useMemo(() => {
    const fromSummary = q.data?.summary?.requested ?? 0;
    const fromRequests =
      q.data?.setupRequests?.filter((r) => r.status === "requested" || r.status === "in_progress").length ?? 0;
    return Math.max(fromSummary, fromRequests);
  }, [q.data]);

  const actionMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/paystack-terminal/payments/${id}`, body),
    onSuccess: async () => {
      adminToast.success("Paystack Terminal payment updated.");
      setResolveFor(null);
      setResolveEntityId("");
      setResolveReason("");
      await invalidatePaystackTerminalQueries(qc);
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update terminal payment"),
  });

  const assetMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/paystack-terminal/terminals/${id}/assets`, body),
    onSuccess: async () => {
      adminToast.success("Terminal assets updated.");
      setAssetFor(null);
      await invalidatePaystackTerminalQueries(qc);
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update terminal assets"),
  });

  const syncMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<{ items: SyncTerminal[]; unmapped: number }>("/api/admin/paystack-terminal/terminals", {
        action: "sync",
      }),
    onSuccess: (data) => {
      setSyncItems(data.items ?? []);
      adminToast.success(`Synced ${data.items?.length ?? 0} Paystack terminals.`);
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to sync Paystack terminals"),
  });

  const syncPaymentsMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<{ checked: number; terminalPayments: number; recorded: number }>(
        "/api/admin/paystack-terminal/payments/sync",
        { perPage: 100 },
      ),
    onSuccess: async (data) => {
      adminToast.success(
        `Checked ${data.checked ?? 0} Paystack transactions; recorded ${data.recorded ?? 0} terminal payments.`,
      );
      await invalidatePaystackTerminalQueries(qc);
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to sync Paystack Terminal payments"),
  });

  const importMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson("/api/admin/paystack-terminal/terminals", { action: "import", ...body }),
    onSuccess: async () => {
      adminToast.success("Paystack terminal imported.");
      await invalidatePaystackTerminalQueries(qc);
      syncMut.mutate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to import Paystack terminal"),
  });

  const createFromRequestMut = useMutation({
    mutationFn: (requestId: string) =>
      adminApi.postJson("/api/admin/paystack-terminal/setup-requests", {
        action: "create_from_request",
        request_id: requestId,
      }),
    onSuccess: async () => {
      adminToast.success("Paystack terminal created from setup request.");
      await invalidatePaystackTerminalQueries(qc);
      syncMut.mutate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create Paystack terminal"),
  });

  const uploadPosterMut = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPoster(id, file),
    onSuccess: async () => {
      adminToast.success("Poster uploaded.");
      setAssetFor(null);
      await invalidatePaystackTerminalQueries(qc);
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to upload poster"),
  });

  const payments = q.data?.payments ?? [];
  const terminals = q.data?.terminals ?? [];
  const setupRequests = q.data?.setupRequests ?? [];
  const summary = q.data?.summary;
  const setupTerminals = useMemo(() => {
    const filtered = terminals.filter((terminal) => {
      if (setupFilter === "requested") {
        return terminal.asset_request_status === "requested" || terminal.asset_request_status === "in_progress";
      }
      if (setupFilter === "needs_assets") return terminal.asset_status !== "ready";
      if (setupFilter === "ready") return terminal.asset_status === "ready";
      return true;
    });
    return [...filtered].sort((a, b) => {
      const ar = a.asset_last_requested_at ? new Date(a.asset_last_requested_at).getTime() : 0;
      const br = b.asset_last_requested_at ? new Date(b.asset_last_requested_at).getTime() : 0;
      return br - ar;
    });
  }, [setupFilter, terminals]);
  const totals = useMemo(() => {
    return payments.reduce(
      (acc, row) => {
        const amount = Number(row.paid_amount ?? 0);
        acc.received += amount;
        if (["allocated", "admin_resolved", "split_allocated"].includes(row.allocation_status)) {
          acc.allocated += Number(row.allocated_amount ?? amount);
        }
        if (row.payout_eligibility_status === "held") acc.held += amount;
        if (row.allocation_status === "provider_declined") acc.declined += amount;
        if (row.allocation_status === "admin_review") acc.review += amount;
        return acc;
      },
      { received: 0, allocated: 0, held: 0, declined: 0, review: 0 },
    );
  }, [payments]);

  function openAssetEditor(terminal: AdminTerminal) {
    setAssetFor(terminal);
    setAssetForm({
      payment_link: terminal.payment_link ?? "",
      terminal_url: terminal.terminal_url ?? "",
      qr_url: terminal.qr_url ?? "",
      poster_url: terminal.poster_url ?? "",
      display_name: terminal.display_name ?? terminal.name ?? "",
      paystack_name: terminal.name ?? "",
      notification_whatsapp: terminal.notification_whatsapp ?? "",
      notification_whatsapp_label: terminal.notification_whatsapp_label ?? "",
      paystack_dashboard_url: terminal.paystack_dashboard_url ?? "",
      asset_notes: "",
      identity_status: terminal.identity_status ?? "verified",
    });
  }

  function openImportModal(item: SyncTerminal) {
    setImportFor(item);
    setImportForm({
      provider_id: item.suggested_matches?.[0]?.provider?.id ?? "",
      payment_link: `https://paystack.shop/pay/${item.code.toLowerCase()}`,
    });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Paystack Terminal Operations" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Paystack Terminal Operations" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Paystack Terminal Operations"
        description="Registry, payment exceptions, payout holds, disputes, and manual allocation resolution for Paystack Virtual Terminal in-person payments."
        actions={
          <>
            <button
              type="button"
              className={adminToolbarButtonClass(syncMut.isPending)}
              disabled={syncMut.isPending}
              onClick={() => syncMut.mutate()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {syncMut.isPending ? "Syncing" : "Sync Paystack"}
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(syncPaymentsMut.isPending)}
              disabled={syncPaymentsMut.isPending}
              onClick={() => syncPaymentsMut.mutate()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {syncPaymentsMut.isPending ? "Checking payments" : "Sync payments"}
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {q.isFetching ? "Refreshing" : "Refresh"}
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Received in filter</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{money(totals.received)}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Allocated</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{money(totals.allocated)}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Admin review</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{money(totals.review)}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Provider declined</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{money(totals.declined)}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Held for payout</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{money(totals.held)}</p>
        </AdminPanel>
      </div>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Needs link</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{summary?.missingPaymentLink ?? 0}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Needs poster / QR</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {Math.max(summary?.missingPoster ?? 0, summary?.missingQr ?? 0)}
          </p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Needs WhatsApp</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{summary?.missingWhatsappDestination ?? 0}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Needs identity review</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{summary?.needsIdentityReview ?? 0}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Requested by providers</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{summary?.requested ?? 0}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Ready for provider</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{summary?.ready ?? 0}</p>
        </AdminPanel>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={adminTabButtonClass(tab === "exceptions")} onClick={() => setTab("exceptions")}>
          Payment exceptions
        </button>
        <button type="button" className={adminTabButtonClass(tab === "terminals")} onClick={() => setTab("terminals")}>
          Terminal registry
        </button>
        <button type="button" className={adminTabButtonClass(tab === "setup")} onClick={() => setTab("setup")}>
          Terminal setup
          {pendingSetupCount > 0 ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pendingSetupCount}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "exceptions" ? (
        <AdminPanel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Payments requiring oversight</h2>
              <p className="mt-1 text-xs text-gray-500">
                Resolve declined allocations, hold or release payout eligibility, and move disputes/refunds out of provider payout.
              </p>
            </div>
            <label className="text-sm text-gray-700">
              Allocation status{" "}
              <select
                className="ml-2 min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm"
                value={allocationStatus}
                onChange={(e) => setAllocationStatus(e.target.value)}
              >
                <option value="admin_review">Admin review</option>
                <option value="provider_declined">Provider declined</option>
                <option value="unmatched">Unmatched</option>
                <option value="suggested">Suggested</option>
                <option value="allocated">Allocated</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>

          {payments.length === 0 ? (
            <EmptyState title="No Paystack Terminal payments" description="No payments match this filter." />
          ) : (
            <AdminDataTable tableClassName="min-w-[1120px]">
              <AdminTableHead>
                <tr>
                  <AdminTh>Payment</AdminTh>
                  <AdminTh>Provider</AdminTh>
                  <AdminTh>Terminal</AdminTh>
                  <AdminTh>Match</AdminTh>
                  <AdminTh>Allocation</AdminTh>
                  <AdminTh>Payout</AdminTh>
                  <AdminTh>Suggested / assigned</AdminTh>
                  <AdminTh>Actions</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <AdminTd>
                      <div className="font-semibold text-gray-900">{money(payment.paid_amount, payment.currency)}</div>
                      <div className="font-mono text-xs text-gray-500">{payment.paystack_reference}</div>
                      {payment.customer_reference ? (
                        <div className="text-xs text-gray-500">Booking/order note: {payment.customer_reference}</div>
                      ) : null}
                    </AdminTd>
                    <AdminTd>{providerLink(payment.provider)}</AdminTd>
                    <AdminTd>
                      <div className="text-sm text-gray-900">{payment.terminal?.name ?? "Portable terminal"}</div>
                      <div className="font-mono text-xs text-gray-500">{payment.terminal?.terminal_code ?? "No code"}</div>
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={payment.amount_match_status} />
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={payment.allocation_status} />
                      {payment.provider_decline_reason ? (
                        <p className="mt-1 max-w-[14rem] text-xs text-red-700">{payment.provider_decline_reason}</p>
                      ) : null}
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={payment.payout_eligibility_status} />
                      <p className="mt-1 text-xs text-gray-500">
                        Remaining {money(payment.remaining_balance, payment.currency)}
                      </p>
                    </AdminTd>
                    <AdminTd>
                      <p className="text-sm text-gray-900">
                        {payment.provider_assigned_entity_type ??
                          payment.suggested_entity_type ??
                          "No target"}
                      </p>
                      <p className="max-w-[12rem] truncate font-mono text-xs text-gray-500">
                        {payment.provider_assigned_entity_id ?? payment.suggested_entity_id ?? "unmatched"}
                      </p>
                    </AdminTd>
                    <AdminTd>
                      <div className="flex min-w-[18rem] flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
                          disabled={actionMut.isPending}
                          onClick={() => setResolveFor(payment)}
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-50"
                          disabled={actionMut.isPending}
                          onClick={() => actionMut.mutate({ id: payment.id, body: { action: "hold" } })}
                        >
                          <PauseCircle className="mr-1 inline h-3.5 w-3.5" />
                          Hold
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
                          disabled={actionMut.isPending}
                          onClick={() => actionMut.mutate({ id: payment.id, body: { action: "release_hold" } })}
                        >
                          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                          Release
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-900 hover:bg-red-50"
                          disabled={actionMut.isPending}
                          onClick={() => actionMut.mutate({ id: payment.id, body: { action: "mark_disputed" } })}
                        >
                          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
                          Dispute
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
                          disabled={actionMut.isPending}
                          onClick={() => actionMut.mutate({ id: payment.id, body: { action: "clear_dispute" } })}
                        >
                          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                          Clear dispute
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-900 hover:bg-red-50"
                          disabled={actionMut.isPending}
                          onClick={() => actionMut.mutate({ id: payment.id, body: { action: "mark_refunded" } })}
                        >
                          Mark refunded
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          disabled={actionMut.isPending}
                          onClick={() => actionMut.mutate({ id: payment.id, body: { action: "mark_admin_review" } })}
                        >
                          To review
                        </button>
                      </div>
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>
      ) : tab === "terminals" ? (
        <AdminPanel>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900">Terminal registry</h2>
            <p className="mt-1 text-xs text-gray-500">
              All provider Paystack Virtual Terminals created through Beautonomi.
            </p>
          </div>
          {terminals.length === 0 ? (
            <EmptyState title="No terminals found" description="No Paystack Virtual Terminals have been created yet." />
          ) : (
            <AdminDataTable tableClassName="min-w-[960px]">
              <AdminTableHead>
                <tr>
                  <AdminTh>Terminal</AdminTh>
                  <AdminTh>Provider</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Assets</AdminTh>
                  <AdminTh>WhatsApp</AdminTh>
                  <AdminTh>Currency</AdminTh>
                  <AdminTh>Last payment</AdminTh>
                  <AdminTh>Created</AdminTh>
                  <AdminTh>Actions</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {terminals.map((terminal) => (
                  <tr key={terminal.id}>
                    <AdminTd>
                      <div className="font-semibold text-gray-900">{terminal.name}</div>
                      {terminal.display_name ? (
                        <div className="text-xs text-gray-500">{terminal.display_name}</div>
                      ) : null}
                      <div className="font-mono text-xs text-gray-500">{terminal.terminal_code}</div>
                    </AdminTd>
                    <AdminTd>{providerLink(terminal.provider)}</AdminTd>
                    <AdminTd>
                      <StatusBadge value={terminal.status} />
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={terminal.asset_status ?? "missing_assets"} />
                      <div className="mt-1 flex gap-2 text-xs text-gray-500">
                        <span>{terminal.payment_link || terminal.terminal_url ? "link" : "no link"}</span>
                        <span>{terminal.poster_url ? "poster" : "no poster"}</span>
                        <span>{terminal.qr_url ? "QR" : "no QR"}</span>
                      </div>
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={terminal.destination_status ?? "not_configured"} />
                      <p className="mt-1 text-xs text-gray-500">{maskPhone(terminal.notification_whatsapp)}</p>
                    </AdminTd>
                    <AdminTd>{terminal.currency ?? "ZAR"}</AdminTd>
                    <AdminTd>{terminal.last_payment_at ? new Date(terminal.last_payment_at).toLocaleString() : "Never"}</AdminTd>
                    <AdminTd>{new Date(terminal.created_at).toLocaleString()}</AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
                        onClick={() => openAssetEditor(terminal)}
                      >
                        Edit assets
                      </button>
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>
      ) : (
        <AdminPanel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Terminal setup queue</h2>
              <p className="mt-1 text-xs text-gray-500">
                Complete Paystack links, posters, QR images, identity, and WhatsApp notification destinations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["requested", "Requested"],
                ["needs_assets", "Needs assets"],
                ["ready", "Ready"],
                ["all", "All"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={adminTabButtonClass(setupFilter === value)}
                  onClick={() => setSetupFilter(value as typeof setupFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {setupRequests.some((request) => ["requested", "in_progress"].includes(request.status)) ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-950">Provider setup requests</h3>
                  <p className="mt-1 text-xs text-amber-900">
                    These are prefilled from provider data for Paystack's Create Virtual Terminal API: name,
                    WhatsApp destination, currency, metadata, and custom fields.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {setupRequests
                  .filter((request) => ["requested", "in_progress"].includes(request.status))
                  .map((request) => (
                    <div key={request.id} className="rounded-xl border border-amber-200 bg-white p-3">
                      <div className="grid gap-3 lg:grid-cols-[1.3fr_1.2fr_1fr_auto] lg:items-start">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {request.provider?.business_name ?? request.provider_id}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Requested {new Date(request.created_at).toLocaleString()}
                            {request.requested_by_user?.email ? ` by ${request.requested_by_user.email}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Location: {request.location?.name ?? "Portable / front desk"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Paystack payload</p>
                          <p className="mt-1 text-sm text-gray-900">{request.suggested_paystack_name}</p>
                          <p className="mt-1 text-xs text-gray-500">Currency: {request.currency}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Custom fields: {(request.custom_fields ?? []).map((field) => field.display_name).join(", ") || "None"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Destination</p>
                          <p className="mt-1 text-sm text-gray-900">
                            {request.destination_target ?? "Missing WhatsApp number"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">{request.destination_name ?? "No label"}</p>
                          {request.request_notes ? (
                            <p className="mt-1 text-xs text-red-700">{request.request_notes}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-50"
                          disabled={createFromRequestMut.isPending || !request.destination_target}
                          onClick={() => createFromRequestMut.mutate(request.id)}
                        >
                          Create in Paystack
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
          {setupTerminals.length === 0 ? (
            <EmptyState title="No terminals in this queue" description="Try another setup filter or sync Paystack." />
          ) : (
          <AdminDataTable tableClassName="min-w-[1080px]">
            <AdminTableHead>
              <tr>
                <AdminTh>Provider / terminal</AdminTh>
                <AdminTh>Request</AdminTh>
                <AdminTh>Identity</AdminTh>
                <AdminTh>Link</AdminTh>
                <AdminTh>Poster / QR</AdminTh>
                <AdminTh>WhatsApp</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {setupTerminals.map((terminal) => (
                <tr key={terminal.id}>
                  <AdminTd>
                    <div>{providerLink(terminal.provider)}</div>
                    <div className="mt-1 font-semibold text-gray-900">{terminal.display_name || terminal.name}</div>
                    <div className="font-mono text-xs text-gray-500">{terminal.terminal_code}</div>
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge value={terminal.asset_request_status ?? "not_requested"} />
                    <p className="mt-1 text-xs text-gray-500">
                      {terminal.asset_last_requested_at
                        ? new Date(terminal.asset_last_requested_at).toLocaleString()
                        : "Not requested"}
                    </p>
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge value={terminal.identity_status ?? "needs_review"} />
                    <p className="mt-1 max-w-[14rem] truncate text-xs text-gray-500">
                      {(terminal.business_snapshot?.provider_business_name as string | undefined) ?? "No snapshot"}
                    </p>
                  </AdminTd>
                  <AdminTd>
                    {terminal.payment_link || terminal.terminal_url ? (
                      <a
                        className="inline-flex items-center text-sm font-medium text-emerald-700 hover:underline"
                        href={terminal.payment_link ?? terminal.terminal_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Link2 className="mr-1 h-4 w-4" />
                        Open link
                      </a>
                    ) : (
                      <StatusBadge value="missing_assets" />
                    )}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-col gap-1 text-sm">
                      <span className={terminal.poster_url ? "text-emerald-700" : "text-amber-700"}>
                        <Upload className="mr-1 inline h-4 w-4" />
                        {terminal.poster_url ? "Poster ready" : "Needs poster"}
                      </span>
                      <span className={terminal.qr_url ? "text-emerald-700" : "text-amber-700"}>
                        <QrCode className="mr-1 inline h-4 w-4" />
                        {terminal.qr_url ? "QR ready" : "Needs QR"}
                      </span>
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge value={terminal.destination_status ?? "not_configured"} />
                    <p className="mt-1 text-xs text-gray-500">{maskPhone(terminal.notification_whatsapp)}</p>
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
                      onClick={() => openAssetEditor(terminal)}
                    >
                      Edit assets
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
          )}
          {syncItems.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-900">Paystack dashboard sync results</h3>
              <p className="mt-1 text-xs text-gray-500">
                Unmapped terminals require Superadmin confirmation before provider ownership is assigned.
              </p>
              <div className="mt-3 space-y-2">
                {syncItems.map((item) => (
                  <div key={item.code} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="font-mono text-xs text-gray-500">{item.code}</p>
                        <p className="text-xs text-gray-500">
                          {item.mapped
                            ? "Already mapped"
                            : item.suggested_matches?.[0]
                              ? `Suggested: ${item.suggested_matches[0].provider.business_name ?? item.suggested_matches[0].provider.id} (${item.suggested_matches[0].confidence}%)`
                              : "No provider suggestion"}
                        </p>
                      </div>
                      {!item.mapped ? (
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
                          disabled={importMut.isPending}
                          onClick={() => openImportModal(item)}
                        >
                          Import / assign
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </AdminPanel>
      )}

      {resolveFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-1 h-5 w-5 text-amber-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Resolve allocation</h3>
                <p className="mt-1 text-sm text-gray-600">
                  This writes the allocation and updates the target booking, product order, or sale when supported.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Entity type
                <select
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3"
                  value={resolveEntityType}
                  onChange={(e) => setResolveEntityType(e.target.value)}
                >
                  <option value="booking">Booking</option>
                  <option value="product_order">Product order</option>
                  <option value="sale">Sale</option>
                  <option value="invoice">Invoice</option>
                  <option value="group_booking">Group booking</option>
                  <option value="additional_charge">Additional charge</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Entity ID
                <input
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 font-mono text-sm"
                  value={resolveEntityId}
                  onChange={(e) => setResolveEntityId(e.target.value)}
                  placeholder="UUID of the booking, order, or sale"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Reason
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value)}
                  placeholder="Why this payment is being assigned here"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={adminToolbarButtonClass(false)}
                onClick={() => setResolveFor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={actionMut.isPending || !resolveEntityId.trim()}
                onClick={() =>
                  actionMut.mutate({
                    id: resolveFor.id,
                    body: {
                      action: "resolve_allocation",
                      entity_type: resolveEntityType,
                      entity_id: resolveEntityId.trim(),
                      reason: resolveReason.trim() || undefined,
                    },
                  })
                }
              >
                {actionMut.isPending ? "Resolving..." : "Resolve allocation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Import Paystack terminal</h3>
            <p className="mt-1 text-sm text-gray-600">
              Assign <span className="font-medium">{importFor.name}</span>{" "}
              <span className="font-mono text-xs text-gray-500">({importFor.code})</span> to a provider.
            </p>
            {importFor.suggested_matches && importFor.suggested_matches.length > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">Suggested match</p>
                {importFor.suggested_matches.map((match) => (
                  <div key={match.provider.id} className="mt-1 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-gray-900">{match.provider.business_name ?? match.provider.id}</p>
                      <p className="font-mono text-xs text-gray-500">{match.provider.id}</p>
                      <p className="text-xs text-amber-800">{match.confidence}% — {match.reasons.join(", ")}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                      onClick={() => setImportForm((prev) => ({ ...prev, provider_id: match.provider.id ?? "" }))}
                    >
                      Use
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Provider ID
                <input
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 font-mono text-sm"
                  value={importForm.provider_id}
                  onChange={(e) => setImportForm((prev) => ({ ...prev, provider_id: e.target.value }))}
                  placeholder="UUID of the provider"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Paystack payment link
                <input
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 text-sm"
                  value={importForm.payment_link}
                  onChange={(e) => setImportForm((prev) => ({ ...prev, payment_link: e.target.value }))}
                  placeholder="https://paystack.shop/pay/..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  Copy the hosted payment page URL from the Paystack dashboard.
                </p>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={adminToolbarButtonClass(false)}
                onClick={() => setImportFor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={importMut.isPending || !importForm.provider_id.trim() || !importForm.payment_link.trim()}
                onClick={() => {
                  importMut.mutate({
                    terminal_code: importFor.code,
                    provider_id: importForm.provider_id.trim(),
                    display_name: importFor.name,
                    payment_link: importForm.payment_link.trim() || null,
                    terminal_url: importForm.payment_link.trim() || null,
                  });
                  setImportFor(null);
                }}
              >
                {importMut.isPending ? "Importing..." : "Import terminal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assetFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Complete terminal assets</h3>
            <p className="mt-1 text-sm text-gray-600">
              Paste the Paystack dashboard link, QR/poster URLs, or upload the poster downloaded from Paystack.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["display_name", "Provider label"],
                ["paystack_name", "Paystack terminal name"],
                ["payment_link", "Provider payment link"],
                ["terminal_url", "Paystack terminal URL"],
                ["qr_url", "QR image URL"],
                ["poster_url", "Poster URL"],
                ["notification_whatsapp", "WhatsApp destination"],
                ["notification_whatsapp_label", "WhatsApp label"],
                ["paystack_dashboard_url", "Paystack dashboard URL"],
              ].map(([key, label]) => (
                <label key={key} className="block text-sm font-medium text-gray-700">
                  {label}
                  <input
                    className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 text-sm"
                    value={(assetForm as any)[key]}
                    onChange={(event) => setAssetForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                </label>
              ))}
              <label className="block text-sm font-medium text-gray-700">
                Identity status
                <select
                  className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 text-sm"
                  value={assetForm.identity_status}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, identity_status: event.target.value }))}
                >
                  <option value="verified">Verified</option>
                  <option value="manual_override">Manual override</option>
                  <option value="needs_review">Needs review</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Upload Paystack poster
                <input
                  className="mt-1 block w-full text-sm text-gray-700"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) uploadPosterMut.mutate({ id: assetFor.id, file });
                  }}
                />
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium text-gray-700">
              Admin notes
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                value={assetForm.asset_notes}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, asset_notes: event.target.value }))}
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className={adminToolbarButtonClass(false)} onClick={() => setAssetFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={assetMut.isPending || uploadPosterMut.isPending}
                onClick={() => {
                  const body = Object.fromEntries(
                    Object.entries(assetForm).map(([key, value]) => [key, value.trim() || null]),
                  );
                  assetMut.mutate({ id: assetFor.id, body });
                }}
              >
                {assetMut.isPending ? "Saving..." : "Save terminal assets"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
