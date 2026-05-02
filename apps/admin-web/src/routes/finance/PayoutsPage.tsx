import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminDataList, type AdminListColumn } from "@/components/admin/AdminDataList";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToast } from "@/lib/adminToast";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";

type PayoutRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  provider?: { business_name?: string } | null;
};

type NegativeBalanceProvidersMeta = {
  count: number;
  providers: Array<{
    provider_id: string;
    raw_balance: number;
    business_name: string | null;
    slug: string | null;
  }>;
};

type PayoutsEnvelope = {
  data: PayoutRow[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
    negative_balance_providers?: NegativeBalanceProvidersMeta;
  };
};

type ModalState = { kind: "reject" | "mark_failed" | "approve" | "mark_paid" | "transfer"; id: string; providerName?: string } | null;

export function PayoutsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  useAdminDocumentTitle("Payouts");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "all";
  const [modal, setModal] = useState<ModalState>(null);
  const [reason, setReason] = useState("");

  const filters = useMemo(() => ({ page, status }), [page, status]);

  const q = useQuery({
    queryKey: adminQueryKeys.payouts.list(filters),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (status !== "all") p.set("status", status);
      return adminApi.getRawJson<PayoutsEnvelope>(`/api/admin/payouts?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;
  const negativeBalances = meta?.negative_balance_providers;

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.payouts.all() });

  const approveMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/payouts/${id}/approve`, { notes: "" }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      adminToast.success("Payout approved");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      adminApi.postJson(`/api/admin/payouts/${id}/reject`, { reason: text }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setReason("");
      adminToast.success("Payout rejected");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const markPaidMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/payouts/${id}/mark-paid`, {}),
    onSuccess: () => {
      invalidate();
      adminToast.success("Marked as paid");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const markFailedMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      adminApi.postJson(`/api/admin/payouts/${id}/mark-failed`, { failure_reason: text }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setReason("");
      adminToast.success("Payout marked failed");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const transferMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/payouts/${id}/initiate-transfer`, {}),
    onSuccess: () => {
      invalidate();
      adminToast.success("Transfer initiated");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    n.set("status", next);
    n.set("page", "1");
    setSp(n, { replace: true });
  }

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    n.set("page", String(next));
    setSp(n, { replace: true });
  }

  function closeModal() {
    setModal(null);
    setReason("");
  }

  function submitModal() {
    if (!modal) return;
    if (modal.kind === "approve") {
      approveMut.mutate(modal.id);
      return;
    }
    if (modal.kind === "mark_paid") {
      markPaidMut.mutate(modal.id);
      setModal(null);
      return;
    }
    if (modal.kind === "transfer") {
      transferMut.mutate(modal.id);
      setModal(null);
      return;
    }
    const text = reason.trim();
    if (modal.kind === "reject") {
      if (!text) return;
      rejectMut.mutate({ id: modal.id, text });
    } else {
      if (!text) return;
      markFailedMut.mutate({ id: modal.id, text });
    }
  }

  const columns: AdminListColumn<PayoutRow>[] = useMemo(
    () => [
      {
        id: "provider",
        header: "Provider",
        cell: (r) => (r.provider as { business_name?: string } | null)?.business_name ?? "—",
      },
      { id: "status", header: "Status", cell: (r) => String(r.status ?? "") },
      {
        id: "amount",
        header: "Amount",
        cell: (r) => (
          <span className="tabular-nums">
            {String(r.currency ?? "")} {Number(r.amount ?? 0).toFixed(2)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: (r) => {
          const id = String(r.id ?? "");
          const st = String(r.status ?? "");
          const providerName = (r.provider as { business_name?: string } | null)?.business_name;
          const busyThis =
            approveMut.isPending ||
            markPaidMut.isPending ||
            transferMut.isPending ||
            ((rejectMut.isPending || markFailedMut.isPending) && modal?.id === id);
          return (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {st === "pending" ? (
                <>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                    disabled={approveMut.isPending || busyThis}
                    onClick={() => {
                      setReason("");
                      setModal({ kind: "approve", id, providerName });
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                    disabled={busyThis}
                    onClick={() => {
                      setReason("");
                      setModal({ kind: "reject", id });
                    }}
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {st === "processing" ? (
                <>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                    disabled={markPaidMut.isPending || busyThis}
                    onClick={() => {
                      setReason("");
                      setModal({ kind: "mark_paid", id, providerName: providerName || undefined });
                    }}
                  >
                    Mark paid
                  </button>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                    disabled={transferMut.isPending || busyThis}
                    onClick={() => {
                      setReason("");
                      setModal({ kind: "transfer", id, providerName: providerName || undefined });
                    }}
                  >
                    Transfer
                  </button>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                    disabled={busyThis}
                    onClick={() => {
                      setReason("");
                      setModal({ kind: "mark_failed", id });
                    }}
                  >
                    Mark failed
                  </button>
                </>
              ) : null}
              {!["pending", "processing"].includes(st) ? <span className="text-gray-400">—</span> : null}
            </div>
          );
        },
      },
    ],
    [
      approveMut,
      markPaidMut,
      transferMut,
      rejectMut,
      markFailedMut,
      modal?.id,
    ]
  );

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Payouts" />
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

  const tabs = ["all", "pending", "processing", "completed", "failed"] as const;
  const modalBusy = approveMut.isPending || rejectMut.isPending || markFailedMut.isPending || markPaidMut.isPending || transferMut.isPending;
  const isApproveModal = modal?.kind === "approve";
  const isMarkPaidModal = modal?.kind === "mark_paid";
  const isTransferModal = modal?.kind === "transfer";
  const isConfirmationOnlyModal = isApproveModal || isMarkPaidModal || isTransferModal;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payouts"
        description="Provider withdrawal queue for this market. Balances are validated when the provider requests a payout; marking paid records the finance ledger so their available balance stays accurate."
      />
      {negativeBalances && negativeBalances.count > 0 ? (
        <AdminPanel>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">
              Negative provider payout balances ({negativeBalances.count})
            </p>
            <p className="mt-1 text-amber-900/90">
              These providers have a ledger shortfall (for example refunds after money was already paid out). Available
              balance shows as 0 for new requests; recover manually if your policy requires clawback.
            </p>
            <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5">
              {negativeBalances.providers.slice(0, 25).map((p) => (
                <li key={p.provider_id} className="tabular-nums">
                  {p.business_name ?? p.slug ?? p.provider_id}: {formatAdminCurrency(p.raw_balance)}
                </li>
              ))}
            </ul>
            {negativeBalances.providers.length > 25 ? (
              <p className="mt-2 text-xs text-amber-900/80">
                Showing 25 of {negativeBalances.providers.length} providers (most negative first).
              </p>
            ) : null}
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">How actions work</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>
            <strong>Approve</strong> moves a request to processing so finance can pay out (notifies the provider).
          </li>
          <li>
            <strong>Transfer</strong> sends the Paystack transfer when the recipient is set up (use when you pay via Paystack).
          </li>
          <li>
            <strong>Mark paid</strong> use when money has actually left the platform (bank / Paystack settled). This writes the
            payout to the finance ledger and is idempotent.
          </li>
          <li>
            <strong>Reject / Mark failed</strong> frees the provider&apos;s balance for a new request (requires a reason).
          </li>
        </ul>
      </AdminPanel>
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t} type="button" className={adminTabButtonClass(status === t)} onClick={() => setStatus(t)}>
              {t}
            </button>
          ))}
        </div>
        {meta ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {meta.page} · {rows.length} rows · total {meta.total}
          </p>
        ) : null}
      </AdminPanel>

      <AdminMutationAlert
        errors={[approveMut.error, rejectMut.error, markPaidMut.error, markFailedMut.error, transferMut.error]}
      />

      <AdminModal
        open={modal != null}
        onClose={closeModal}
        title={
          isApproveModal
            ? "Confirm payout approval"
            : isMarkPaidModal
              ? "Confirm payout paid"
              : isTransferModal
                ? "Confirm payout transfer"
                : modal?.kind === "reject"
                  ? "Reject payout"
                  : "Mark payout failed"
        }
        description={
          isApproveModal
            ? `Approve payout for ${modal?.providerName ?? "this provider"}? This cannot be undone.`
            : isMarkPaidModal
              ? `Mark payout for ${modal?.providerName ?? "this provider"} as paid? Use this only after settlement is confirmed.`
              : isTransferModal
                ? `Initiate transfer for ${modal?.providerName ?? "this provider"}? This may trigger a real provider payout.`
                : modal?.kind === "reject"
                  ? "A reason is required."
                  : "A failure reason is required."
        }
        footer={
          <>
            <button type="button" className={adminToolbarButtonClass()} onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={modalBusy || (!isConfirmationOnlyModal && !reason.trim())}
              onClick={() => submitModal()}
            >
              {isApproveModal ? "Approve" : isMarkPaidModal ? "Mark paid" : isTransferModal ? "Transfer" : "Submit"}
            </button>
          </>
        }
      >
        {isConfirmationOnlyModal ? (
          <p className="text-sm text-gray-600">
            {isApproveModal
              ? "Approving a payout moves it to processing and notifies the provider. Make sure the payout amount and provider details are correct before proceeding."
              : isMarkPaidModal
                ? "This records the payout as paid in admin operations. Confirm the external payment has settled before continuing."
                : "This starts the transfer flow for the payout. Confirm provider banking details and amount before continuing."}
          </p>
        ) : (
          <textarea
            className="min-h-[120px] w-full rounded-xl border border-gray-300 p-3 text-sm shadow-inner"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason…"
          />
        )}
      </AdminModal>

      <AdminDataList
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id ?? "")}
        empty={<EmptyState title="No payouts" description="Try another status filter." />}
      />

      {meta && meta.total > meta.limit ? (
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
            className={adminToolbarButtonClass(!meta.has_more)}
            disabled={!meta.has_more}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
