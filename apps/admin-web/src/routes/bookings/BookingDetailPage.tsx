import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

interface BookingServiceRow {
  id: string;
  duration_minutes?: number;
  price?: number;
  offerings?: { id?: string; title?: string } | null;
}

interface BookingProductRow {
  id: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  products?: { id?: string; name?: string; retail_price?: number } | null;
}

interface BookingDetail {
  id: string;
  booking_number: string;
  customer_id: string;
  provider_id: string;
  status: string;
  scheduled_at: string;
  location_type: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  country?: string;
  total_amount: number;
  currency: string;
  notes?: string;
  customer?: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url?: string;
  };
  provider?: {
    id: string;
    business_name: string;
    slug: string;
    email: string;
    phone: string;
  };
  location?: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    country: string;
  };
  booking_services?: BookingServiceRow[];
  booking_products?: BookingProductRow[];
  payment_transaction?: { status?: string; amount?: number; transaction_id?: string } | null;
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookingDetailPage() {
  const { id: bookingId = "" } = useParams<{ id: string }>();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const qc = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<BookingDetail>>({});
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.bookings.detail(bookingId),
    queryFn: () => adminApi.getJson<BookingDetail>(`/api/admin/bookings/${bookingId}`, { timeoutMs: 45_000 }),
    enabled: allowed && !!bookingId,
  });

  const booking = q.data;

  const saveMutation = useMutation({
    mutationFn: (body: Partial<BookingDetail>) => adminApi.patchJson<BookingDetail>(`/api/admin/bookings/${bookingId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.detail(bookingId) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.all() });
      setIsEditing(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string | undefined) =>
      adminApi.postJson(`/api/admin/bookings/${bookingId}/cancel`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.detail(bookingId) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.all() });
      setShowCancel(false);
      setCancelReason("");
    },
  });

  const refundMutation = useMutation({
    mutationFn: (payload: { amount: number; reason?: string }) =>
      adminApi.postJson(`/api/admin/bookings/${bookingId}/refund`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.detail(bookingId) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.all() });
      setShowRefund(false);
      setRefundReason("");
    },
  });

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageSkeleton rows={8} />
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    const notFound = q.error instanceof AdminApiError && q.error.status === 404;
    if (!notFound) {
      return (
        <div className="space-y-6">
          <AdminPageHeader title="Booking" />
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
          <Link to="/bookings" className="text-sm font-medium text-gray-900 underline">
            ← Back to bookings
          </Link>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Booking" />
        <EmptyState title="Booking not found" description={q.error.message} />
        <Link to="/bookings" className="text-sm font-medium text-gray-900 underline">
          ← Back to bookings
        </Link>
      </div>
    );
  }

  if (!booking) {
    return (
      <EmptyState title="No data" description="Booking could not be loaded." />
    );
  }

  const edit = isEditing ? { ...booking, ...editData } : booking;
  const subtotal = booking.booking_services?.reduce((s, x) => s + (x.price || 0), 0) || 0;
  const productTotal = booking.booking_products?.reduce((s, x) => s + (x.total_price || 0), 0) || 0;

  const startEdit = () => {
    setEditData({ ...booking });
    setRefundAmount(booking.total_amount || 0);
    setIsEditing(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/bookings" className="text-sm text-gray-600 hover:text-gray-900">
            ← Bookings
          </Link>
          <AdminPageHeader
            title={`Booking #${booking.booking_number}`}
            description={new Date(booking.scheduled_at).toLocaleString(undefined, {
              dateStyle: "full",
              timeStyle: "short",
            })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEditing ? (
            <>
              <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" onClick={startEdit}>
                Edit
              </button>
              {booking.status !== "cancelled" && booking.status !== "completed" ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white"
                    onClick={() => setShowCancel(true)}
                  >
                    Cancel
                  </button>
                  {booking.payment_transaction ? (
                    <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" onClick={() => setShowRefund(true)}>
                      Refund
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditData({});
                }}
              >
                Discard
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={saveMutation.isPending}
                onClick={() =>
                  saveMutation.mutate({
                    status: editData.status,
                    scheduled_at: editData.scheduled_at,
                    location_type: editData.location_type,
                    address_line1: editData.address_line1,
                    city: editData.city,
                    notes: editData.notes,
                  })
                }
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AdminPanel>
            <h2 className="mb-4 text-lg font-semibold">Booking</h2>
            {isEditing ? (
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-gray-600">Status</span>
                  <select
                    value={edit.status}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-300 p-2"
                  >
                    {["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-gray-600">Scheduled</span>
                  <input
                    type="datetime-local"
                    value={edit.scheduled_at ? toDatetimeLocalValue(edit.scheduled_at) : ""}
                    onChange={(e) =>
                      setEditData({ ...editData, scheduled_at: new Date(e.target.value).toISOString() })
                    }
                    className="mt-1 w-full rounded border border-gray-300 p-2"
                  />
                </label>
                <label className="block">
                  <span className="text-gray-600">Location type</span>
                  <select
                    value={edit.location_type || ""}
                    onChange={(e) => setEditData({ ...editData, location_type: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-300 p-2"
                  >
                    <option value="at_salon">At salon</option>
                    <option value="at_home">At home</option>
                  </select>
                </label>
                {edit.location_type === "at_home" ? (
                  <>
                    <label className="block">
                      <span className="text-gray-600">Address line 1</span>
                      <input
                        value={edit.address_line1 ?? ""}
                        onChange={(e) => setEditData({ ...editData, address_line1: e.target.value })}
                        className="mt-1 w-full rounded border border-gray-300 p-2"
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-600">City</span>
                      <input
                        value={edit.city ?? ""}
                        onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                        className="mt-1 w-full rounded border border-gray-300 p-2"
                      />
                    </label>
                  </>
                ) : null}
                <label className="block">
                  <span className="text-gray-600">Notes</span>
                  <textarea
                    value={edit.notes ?? ""}
                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                    rows={4}
                    className="mt-1 w-full rounded border border-gray-300 p-2"
                  />
                </label>
              </div>
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="font-medium">{booking.status}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Location</dt>
                  <dd className="capitalize">{booking.location_type?.replace("_", " ")}</dd>
                </div>
                {booking.notes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Notes</dt>
                    <dd>{booking.notes}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </AdminPanel>

          <AdminPanel>
            <h2 className="mb-4 text-lg font-semibold">Services & products</h2>
            {booking.booking_services && booking.booking_services.length > 0 ? (
              <ul className="mb-4 space-y-2">
                {booking.booking_services.map((s) => (
                  <li key={s.id} className="flex justify-between rounded border border-gray-100 p-2 text-sm">
                    <span>{s.offerings?.title ?? "Service"}</span>
                    <span>
                      {booking.currency} {s.price?.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {booking.booking_products && booking.booking_products.length > 0 ? (
              <ul className="space-y-2">
                {booking.booking_products.map((p) => (
                  <li key={p.id} className="flex justify-between rounded border border-gray-100 p-2 text-sm">
                    <span>{p.products?.name ?? "Product"}</span>
                    <span>
                      {booking.currency} {p.total_price?.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {!booking.booking_services?.length && !booking.booking_products?.length ? (
              <p className="text-sm text-gray-500">No line items</p>
            ) : null}
          </AdminPanel>

          {booking.payment_transaction ? (
            <AdminPanel>
              <h2 className="mb-2 text-lg font-semibold">Payment</h2>
              <p className="text-sm text-gray-600">Status: {booking.payment_transaction.status}</p>
              <p className="text-sm text-gray-600">
                Amount: {booking.currency} {booking.payment_transaction.amount?.toFixed(2)}
              </p>
            </AdminPanel>
          ) : null}
        </div>

        <div className="space-y-6">
          <AdminPanel>
            <h2 className="mb-3 text-lg font-semibold">Customer</h2>
            <p className="font-medium">{booking.customer?.full_name ?? "—"}</p>
            <p className="text-sm text-gray-600">{booking.customer?.email}</p>
            <a
              href={legacyAdminHref(`/admin/users/${booking.customer_id}`)}
              className="mt-3 inline-block text-sm font-medium text-gray-900 underline"
            >
              Open in legacy profile →
            </a>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-lg font-semibold">Provider</h2>
            <p className="font-medium">{booking.provider?.business_name ?? "—"}</p>
            <a
              href={legacyAdminHref(`/admin/providers/${booking.provider_id}`)}
              className="mt-3 inline-block text-sm font-medium text-gray-900 underline"
            >
              Open in legacy profile →
            </a>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-lg font-semibold">Totals</h2>
            <p className="text-sm text-gray-600">Services subtotal: {booking.currency} {subtotal.toFixed(2)}</p>
            {productTotal > 0 ? (
              <p className="text-sm text-gray-600">Products: {booking.currency} {productTotal.toFixed(2)}</p>
            ) : null}
            <p className="mt-2 font-semibold">
              Total: {booking.currency} {booking.total_amount?.toFixed(2)}
            </p>
          </AdminPanel>
        </div>
      </div>

      <AdminModal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel booking"
        description="This cannot be undone."
        labelledBy="booking-cancel-modal-title"
        footer={
          <>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setShowCancel(false)}>
              Back
            </button>
            <button
              type="button"
              className="rounded bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(cancelReason || undefined)}
            >
              Confirm cancel
            </button>
          </>
        }
      >
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          className="w-full rounded border border-gray-300 p-2 text-sm"
        />
        <AdminMutationAlert errors={[cancelMutation.error]} />
      </AdminModal>

      <AdminModal
        open={showRefund}
        onClose={() => setShowRefund(false)}
        title="Process refund"
        labelledBy="booking-refund-modal-title"
        footer={
          <>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setShowRefund(false)}>
              Back
            </button>
            <button
              type="button"
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={refundMutation.isPending}
              onClick={() => refundMutation.mutate({ amount: refundAmount, reason: refundReason || undefined })}
            >
              Process refund
            </button>
          </>
        }
      >
        <label className="block text-sm">
          Amount
          <input
            type="number"
            value={refundAmount}
            onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
            className="mt-1 w-full rounded border border-gray-300 p-2"
            min={0}
            max={booking.total_amount}
          />
        </label>
        <textarea
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          className="mt-3 w-full rounded border border-gray-300 p-2 text-sm"
        />
        <AdminMutationAlert errors={[refundMutation.error]} />
      </AdminModal>

      {isEditing ? <AdminMutationAlert errors={[saveMutation.error]} /> : null}
    </div>
  );
}
