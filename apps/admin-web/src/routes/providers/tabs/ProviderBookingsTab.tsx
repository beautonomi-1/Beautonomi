import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type Props = {
  providerCanonicalId: string;
};

/** Flat shape from /api/admin/bookings after transformation in the route */
type BookingRow = {
  id: string;
  booking_number?: string | null;
  status?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  provider_id?: string | null;
};

type BookingsResponse = {
  bookings: BookingRow[];
  total: number;
  page: number;
  limit: number;
};

const BOOKING_STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  cancelled: "bg-gray-100 text-gray-600",
  no_show: "bg-red-100 text-red-800",
  pending_payment: "bg-yellow-100 text-yellow-800",
};

const cur = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
}).format;

export function ProviderBookingsTab({ providerCanonicalId }: Props) {
  const [status, setStatus] = useState("all");
  const [statusDraft, setStatusDraft] = useState("all");
  const [page, setPage] = useState(0);

  const qs = new URLSearchParams({
    provider_id: providerCanonicalId,
    page: String(page),
    limit: "25",
  });
  if (status && status !== "all") qs.set("status", status);

  const bookingsQ = useQuery({
    queryKey: adminQueryKeys.providers.bookings(providerCanonicalId, { page, status }),
    queryFn: () =>
      adminApi.getJson<BookingsResponse>(
        `/api/admin/bookings?${qs.toString()}`,
        { timeoutMs: 30_000 },
      ),
    enabled: !!providerCanonicalId,
    placeholderData: (prev) => prev,
  });

  const bookings = bookingsQ.data?.bookings ?? [];
  const total = bookingsQ.data?.total ?? 0;
  const limit = bookingsQ.data?.limit ?? 25;
  const hasMore = (page + 1) * limit < total;

  return (
    <div className="space-y-6">
      <AdminPanel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Provider bookings</h2>
            <p className="mt-1 text-sm text-gray-600">
              All bookings for this provider. Filter by status or open the booking detail.
            </p>
          </div>
          <Link
            to={adminSpaTo(`/admin/bookings?provider_id=${encodeURIComponent(providerCanonicalId)}`)}
            className="shrink-0 text-sm font-medium text-primary underline"
          >
            Full bookings list →
          </Link>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
            </select>
          </div>
          <button
            type="button"
            className={adminToolbarButtonClass(bookingsQ.isFetching)}
            disabled={bookingsQ.isFetching}
            onClick={() => { setStatus(statusDraft); setPage(0); }}
          >
            {bookingsQ.isFetching ? "Loading…" : "Apply"}
          </button>
          {total > 0 && (
            <span className="text-xs text-gray-400 ml-auto">
              {total} booking{total === 1 ? "" : "s"} total
            </span>
          )}
        </div>

        {/* Table */}
        {bookingsQ.isLoading ? (
          <p className="mt-4 text-sm text-gray-400">Loading bookings…</p>
        ) : bookings.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No bookings found.</p>
        ) : (
          <>
            <AdminDataTable className="mt-4">
              <AdminTableHead>
                <tr>
                  <AdminTh>Booking #</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Customer</AdminTh>
                  <AdminTh>Scheduled</AdminTh>
                  <AdminTh>Amount</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/60">
                    <AdminTd>
                      <Link
                        to={adminSpaTo(`/admin/bookings/${b.id}`)}
                        className="font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {b.booking_number ?? b.id.slice(-8)}
                      </Link>
                    </AdminTd>
                    <AdminTd>
                      <span className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        BOOKING_STATUS_COLORS[b.status ?? ""] ?? "bg-gray-100 text-gray-600",
                      )}>
                        {b.status ?? "—"}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      {b.customer_id ? (
                        <Link
                          to={adminSpaTo(`/admin/users/${b.customer_id}`)}
                          className="text-sm text-primary hover:underline"
                        >
                          {b.customer_name ?? b.customer_email ?? b.customer_id.slice(-8)}
                        </Link>
                      ) : "—"}
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500 whitespace-nowrap">
                      {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"}
                    </AdminTd>
                    <AdminTd className="tabular-nums text-sm font-medium">
                      {b.total_amount != null ? cur(b.total_amount) : "—"}
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>

            {total > limit && (
              <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                <span>
                  Page {page + 1} · {Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 0 || bookingsQ.isFetching}
                    onClick={() => setPage((p) => p - 1)}
                    className={adminToolbarButtonClass(page === 0 || bookingsQ.isFetching)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!hasMore || bookingsQ.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                    className={adminToolbarButtonClass(!hasMore || bookingsQ.isFetching)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </AdminPanel>
    </div>
  );
}
