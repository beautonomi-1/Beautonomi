import { useQuery } from "@tanstack/react-query";
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
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTh,
  AdminTd,
} from "@/components/admin/AdminDataTable";
import { adminToolbarButtonClass } from "@/lib/adminUi";

type WalletRefundRow = {
  id: string;
  booking_id: string;
  amount: number;
  status: string;
  created_at: string;
  created_by: string | null;
  online_collected: number;
  in_person_collected: number;
};

type GroupYocoRow = {
  id: string;
  booking_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  bookings?: { group_booking_id?: string | null; provider_id?: string | null } | null;
};

type EventRow = {
  id: string;
  booking_id: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
  created_by?: string | null;
};

type AnomaliesPayload = {
  wallet_refund_on_in_person: WalletRefundRow[];
  group_yoco_mark_paid_without_ref: GroupYocoRow[];
  terminal_capture_on_paid_booking: EventRow[];
  refund_issued_by_staff: EventRow[];
  limit: number;
};

const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");
const fmtMoney = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(2);
const eventField = (row: EventRow, key: string) => {
  const v = row.event_data?.[key];
  return v == null || v === "" ? "—" : String(v);
};

export function RefundAnomaliesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  useAdminDocumentTitle("Refund Anomalies");

  const q = useQuery({
    queryKey: adminQueryKeys.finance.refundAnomalies(),
    queryFn: () => adminApi.getJson<AnomaliesPayload>("/api/admin/finance/refund-anomalies"),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Refund Anomalies" />
        <AdminPanel><AdminPageSkeleton rows={4} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Refund Anomalies" />
        <AdminPanel><AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} /></AdminPanel>
      </div>
    );
  }

  const data = q.data;
  const walletRows = data?.wallet_refund_on_in_person ?? [];
  const yocoRows = data?.group_yoco_mark_paid_without_ref ?? [];
  const lateCaptureRows = data?.terminal_capture_on_paid_booking ?? [];
  const staffRefundRows = data?.refund_issued_by_staff ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Refund Anomalies"
        description={`Read-only signals for provider refund and in-person payment abuse. Each list shows the latest ${data?.limit ?? 200} rows.`}
        actions={
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        }
      />

      <AdminPanel>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Wallet refunds on in-person bookings</h2>
        <p className="mb-4 text-xs text-gray-500">
          Store-credit refunds where the booking collected more in person (cash, card machine, transfer) than online.
        </p>
        {walletRows.length === 0 ? (
          <EmptyState title="Nothing flagged" description="No wallet refunds exceed the online-collected share." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Created</AdminTh>
                <AdminTh>Booking</AdminTh>
                <AdminTh>Wallet refund</AdminTh>
                <AdminTh>Online collected</AdminTh>
                <AdminTh>In person collected</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Created by</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {walletRows.map((r) => (
                <tr key={r.id}>
                  <AdminTd>{fmtDate(r.created_at)}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.booking_id}</AdminTd>
                  <AdminTd>{fmtMoney(r.amount)}</AdminTd>
                  <AdminTd>{fmtMoney(r.online_collected)}</AdminTd>
                  <AdminTd>{fmtMoney(r.in_person_collected)}</AdminTd>
                  <AdminTd>{r.status}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.created_by ?? "—"}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Group payments marked as Yoco with no Yoco transaction</h2>
        <p className="mb-4 text-xs text-gray-500">
          Manual group mark-paid rows recorded with provider Yoco but no gateway reference.
        </p>
        {yocoRows.length === 0 ? (
          <EmptyState title="Nothing flagged" description="Every Yoco group payment has a transaction reference." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Created</AdminTh>
                <AdminTh>Booking</AdminTh>
                <AdminTh>Group</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Notes</AdminTh>
                <AdminTh>Created by</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {yocoRows.map((r) => (
                <tr key={r.id}>
                  <AdminTd>{fmtDate(r.created_at)}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.booking_id}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.bookings?.group_booking_id ?? "—"}</AdminTd>
                  <AdminTd>{fmtMoney(r.amount)}</AdminTd>
                  <AdminTd className="max-w-xs truncate">{r.notes ?? "—"}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.created_by ?? "—"}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Card machine captures on already-paid bookings</h2>
        <p className="mb-4 text-xs text-gray-500">
          A terminal charge succeeded after the booking was already settled. Refund the duplicate on the terminal.
        </p>
        {lateCaptureRows.length === 0 ? (
          <EmptyState title="Nothing flagged" description="No late terminal captures recorded." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Created</AdminTh>
                <AdminTh>Booking</AdminTh>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Payment ref</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {lateCaptureRows.map((r) => (
                <tr key={r.id}>
                  <AdminTd>{fmtDate(r.created_at)}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.booking_id}</AdminTd>
                  <AdminTd>{eventField(r, "payment_provider")}</AdminTd>
                  <AdminTd>{eventField(r, "amount")}</AdminTd>
                  <AdminTd className="font-mono text-xs">{eventField(r, "provider_payment_id")}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Refunds issued by staff</h2>
        <p className="mb-4 text-xs text-gray-500">Audit trail of provider-side refunds (owner and team).</p>
        {staffRefundRows.length === 0 ? (
          <EmptyState title="No staff refunds" description="No provider refund events recorded yet." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Created</AdminTh>
                <AdminTh>Booking</AdminTh>
                <AdminTh>Method</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Reason</AdminTh>
                <AdminTh>Created by</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {staffRefundRows.map((r) => (
                <tr key={r.id}>
                  <AdminTd>{fmtDate(r.created_at)}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.booking_id}</AdminTd>
                  <AdminTd>{eventField(r, "refund_method")}</AdminTd>
                  <AdminTd>{eventField(r, "amount")}</AdminTd>
                  <AdminTd className="max-w-xs truncate">{eventField(r, "reason")}</AdminTd>
                  <AdminTd className="font-mono text-xs">{r.created_by ?? "—"}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
