import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";

type Proposal = {
  id: string;
  kind: string;
  status: string;
  proposed_by?: string | null;
  payload?: Record<string, unknown>;
  note?: string | null;
  error?: string | null;
  created_at: string;
  proposed_by_user?: { full_name?: string | null; email?: string | null } | null;
  approved_by_user?: { full_name?: string | null; email?: string | null } | null;
};

export function LedgerRepairPage() {
  useAdminDocumentTitle("Ledger repair");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  const qc = useQueryClient();
  const [status, setStatus] = useState("proposed");
  const [bookingId, setBookingId] = useState("");
  const [bookingPaymentId, setBookingPaymentId] = useState("");
  const [reference, setReference] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [fees, setFees] = useState("0");
  const [note, setNote] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const query = useQuery({
    queryKey: adminQueryKeys.ledgerRepair(status),
    enabled: allowed,
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (status) params.set("status", status);
      return adminApi.getJson<{ proposals: Proposal[]; total: number }>(
        `/api/admin/finance/ledger-repair?${params}`,
        { timeoutMs: 30_000 },
      );
    },
  });

  const proposeMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/finance/ledger-repair/propose", {
        kind: "missing_online_charge_ledger",
        note: note.trim() || undefined,
        payload: {
          bookingId: bookingId.trim(),
          bookingPaymentId: bookingPaymentId.trim() || undefined,
          reference: reference.trim(),
          amountMajor: Number(amountMajor),
          fees: Number(fees) || 0,
        },
      }),
    onSuccess: () => {
      adminToast.success("Proposal created — a different superadmin must approve");
      setBookingId("");
      setBookingPaymentId("");
      setReference("");
      setAmountMajor("");
      setFees("0");
      setNote("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.ledgerRepair(status) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/finance/ledger-repair/${id}/approve`, {}),
    onSuccess: () => {
      adminToast.success("Approved and posted");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.ledgerRepair(status) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => {
      if (!rejectId) throw new Error("No proposal selected");
      return adminApi.postJson(`/api/admin/finance/ledger-repair/${rejectId}/reject`, {
        reason: rejectReason.trim() || "Rejected from admin console",
      });
    },
    onSuccess: () => {
      adminToast.success("Proposal rejected");
      setRejectId(null);
      setRejectReason("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.ledgerRepair(status) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;

  const rows = query.data?.proposals ?? [];
  const authFailed = isAdminApiAuthFailure(query.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Ledger repair"
        description="Maker-checker backfill for missing online-charge ledger rows. Finance proposes; a different superadmin approves. Period locks are respected."
      />

      <AdminPanel>
        <h3 className="mb-3 text-sm font-semibold">Propose missing online charge</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Booking UUID" value={bookingId} onChange={(e) => setBookingId(e.target.value)} />
          <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="booking_payments.id (optional)" value={bookingPaymentId} onChange={(e) => setBookingPaymentId(e.target.value)} />
          <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Paystack / payment reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Amount (major units)" value={amountMajor} onChange={(e) => setAmountMajor(e.target.value)} />
          <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Gateway fees (major)" value={fees} onChange={(e) => setFees(e.target.value)} />
          <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button
          type="button"
          className={`${adminToolbarButtonClass()} mt-3`}
          disabled={proposeMut.isPending || !bookingId.trim() || !reference.trim() || !amountMajor}
          onClick={() => void proposeMut.mutate()}
        >
          {proposeMut.isPending ? "Proposing…" : "Propose repair"}
        </button>
      </AdminPanel>

      <AdminPanel>
        <div className="mb-4 flex flex-wrap gap-2">
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="proposed">Proposed</option>
            <option value="approved">Approved</option>
            <option value="posted">Posted</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
        {query.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : authFailed ? (
          <AdminRetryBlock message={query.error instanceof Error ? query.error.message : "Failed to load"} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No proposals" description="Propose a missing online-charge repair above, or an adjustment via the finance API." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Created</AdminTh>
              <AdminTh>Kind</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Proposed by</AdminTh>
              <AdminTh>Payload</AdminTh>
              <AdminTh>Actions</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <AdminTd className="text-xs text-gray-600">{new Date(row.created_at).toLocaleString()}</AdminTd>
                  <AdminTd className="font-mono text-xs">{row.kind}</AdminTd>
                  <AdminTd>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", row.status === "proposed" ? "bg-amber-100 text-amber-800" : row.status === "posted" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700")}>
                      {row.status}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs">{row.proposed_by_user?.full_name || row.proposed_by_user?.email || "—"}</AdminTd>
                  <AdminTd className="max-w-xs truncate font-mono text-xs" title={JSON.stringify(row.payload)}>
                    {row.payload?.reference ? String(row.payload.reference) : JSON.stringify(row.payload ?? {})}
                    {row.error ? <span className="block text-red-700">{row.error}</span> : null}
                  </AdminTd>
                  <AdminTd>
                    {row.status === "proposed" &&
                    isSuperadmin &&
                    row.proposed_by !== bootstrap?.userId ? (
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="text-xs text-emerald-700 underline" onClick={() => void approveMut.mutate(row.id)}>
                          Approve
                        </button>
                        <button type="button" className="text-xs text-red-700 underline" onClick={() => setRejectId(row.id)}>
                          Reject
                        </button>
                      </div>
                    ) : row.status === "proposed" ? (
                      <span className="text-xs text-gray-500">Awaiting another superadmin</span>
                    ) : (
                      "—"
                    )}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {rejectId ? (
        <AdminPanel>
          <h3 className="mb-2 text-sm font-semibold">Reject proposal</h3>
          <input className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className={adminToolbarButtonClass()} onClick={() => void rejectMut.mutate()}>
              Confirm reject
            </button>
            <button type="button" className={adminToolbarButtonClass()} onClick={() => setRejectId(null)}>
              Cancel
            </button>
          </div>
        </AdminPanel>
      ) : null}
    </div>
  );
}
