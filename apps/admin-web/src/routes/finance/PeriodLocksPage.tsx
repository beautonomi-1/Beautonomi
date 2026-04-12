import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminToast } from "@/lib/adminToast";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTh,
  AdminTd,
} from "@/components/admin/AdminDataTable";
import { adminToolbarButtonClass } from "@/lib/adminUi";

interface PeriodLock {
  id: string;
  period_start: string;
  period_end: string;
  locked_at: string;
  locked_by: string | null;
  locked_by_name: string | null;
  notes: string | null;
}

type LocksPayload = {
  locks: PeriodLock[];
  migration_required?: boolean;
  message?: string;
};

export function PeriodLocksPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  useAdminDocumentTitle("Financial Period Locks");
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.finance.periodLocks(),
    queryFn: () => adminApi.getJson<LocksPayload>("/api/admin/finance/period-locks"),
    enabled: allowed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.finance.periodLocks() });

  const createMut = useMutation({
    mutationFn: (body: { period_start: string; period_end: string; notes?: string }) =>
      adminApi.postJson("/api/admin/finance/period-locks", body),
    onSuccess: () => {
      adminToast.success("Period locked successfully.");
      setShowForm(false);
      setFormStart("");
      setFormEnd("");
      setFormNotes("");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create lock"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/finance/period-locks/${id}`),
    onSuccess: () => {
      adminToast.success("Period unlocked.");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to unlock period"),
  });

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Financial Period Locks" />
        <AdminPanel><AdminPageSkeleton rows={3} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Financial Period Locks" />
        <AdminPanel><AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} /></AdminPanel>
      </div>
    );
  }

  const locks = q.data?.locks ?? [];
  const migrationRequired = q.data?.migration_required;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Financial Period Locks"
        description="Lock accounting periods to prevent backdated transaction writes (refunds, payouts, ledger entries)."
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            {showForm ? "Cancel" : "+ Lock period"}
          </button>
        }
      />

      {migrationRequired && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Migration required:</strong> The <code className="rounded bg-amber-100 px-1">financial_period_locks</code> table
          does not exist in this database. Run the migration in <code className="rounded bg-amber-100 px-1">supabase/migrations</code> to enable period locking.
        </div>
      )}

      {showForm && (
        <AdminPanel>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Lock a new period</h2>
          <p className="mb-4 text-xs text-gray-500">
            Locking a period prevents admins from creating refunds, marking payouts as paid, or inserting ledger entries
            with dates within the locked range. Only superadmins and admins can lock or unlock periods.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period start *</label>
              <input
                type="date"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period end *</label>
              <input
                type="date"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                min={formStart || undefined}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="e.g. Q1 2025 close — auditor sign-off received"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!formStart || !formEnd || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  period_start: formStart,
                  period_end: formEnd,
                  notes: formNotes || undefined,
                })
              }
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {createMut.isPending ? "Locking…" : "Lock period"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </AdminPanel>
      )}

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Active period locks</h2>
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        </div>

        {locks.length === 0 ? (
          <EmptyState
            title="No locked periods"
            description="Create a period lock to prevent changes to closed accounting periods."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Period start</AdminTh>
                <AdminTh>Period end</AdminTh>
                <AdminTh>Locked at</AdminTh>
                <AdminTh>Locked by</AdminTh>
                <AdminTh>Notes</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {locks.map((lock) => (
                <tr key={lock.id}>
                  <AdminTd>{lock.period_start?.slice(0, 10)}</AdminTd>
                  <AdminTd>{lock.period_end?.slice(0, 10)}</AdminTd>
                  <AdminTd>{lock.locked_at ? new Date(lock.locked_at).toLocaleDateString() : "—"}</AdminTd>
                  <AdminTd>{lock.locked_by_name ?? lock.locked_by ?? "—"}</AdminTd>
                  <AdminTd className="max-w-xs truncate">{lock.notes ?? "—"}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Unlock period ${lock.period_start?.slice(0, 10)} – ${lock.period_end?.slice(0, 10)}? This will allow writes to this period again.`
                          )
                        )
                          deleteMut.mutate(lock.id);
                      }}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Unlock
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <strong>How period locking works:</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>When a period is locked, any admin action that would write a finance_transactions row with a date in the locked range is rejected with a 409 error.</li>
          <li>Affected actions: mark payout as paid, process refund, manual ledger entries.</li>
          <li>Existing records are <em>not</em> altered — locking is a forward-looking control.</li>
          <li>Only superadmins and admins can create or remove period locks.</li>
          <li>All lock and unlock actions are recorded in the audit log.</li>
        </ul>
      </div>
    </div>
  );
}
