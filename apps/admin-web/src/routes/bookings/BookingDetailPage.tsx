import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminBreadcrumbLeaf } from "@/providers/AdminBreadcrumbProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";

type OfferingEmbed = {
  id?: string;
  title?: string;
  variant_name?: string | null;
  parent_service_id?: string | null;
  service_type?: string | null;
};

interface BookingServiceRow {
  id: string;
  duration_minutes?: number;
  price?: number;
  currency?: string;
  customization?: string | null;
  guest_name?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  offerings?: OfferingEmbed | OfferingEmbed[] | null;
  staff?: { id?: string; name?: string | null; role?: string | null } | { id?: string; name?: string | null; role?: string | null }[] | null;
}

interface BookingProductRow {
  id: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  product_variant_id?: string | null;
  notes?: string | null;
  products?: { id?: string; name?: string; retail_price?: number } | { id?: string; name?: string; retail_price?: number }[] | null;
  product_variant?: {
    id?: string;
    option_values?: Record<string, unknown> | unknown;
  } | { id?: string; option_values?: Record<string, unknown> | unknown }[] | null;
}

interface BookingAddonRow {
  id: string;
  addon_id?: string;
  addon_name?: string | null;
  quantity?: number;
  price?: number;
}

interface AdditionalChargeRow {
  id: string;
  description?: string;
  amount?: number;
  currency?: string;
  status?: string;
  requested_at?: string;
  paid_at?: string | null;
}

interface TipAllocationRow {
  id: string;
  staff_id?: string;
  amount?: number;
  staff?: { id?: string; name?: string | null } | { id?: string; name?: string | null }[] | null;
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
  /** @deprecated API may expose legacy alias; prefer address_city */
  city?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  country?: string;
  address_country?: string;
  total_amount: number;
  currency: string;
  subtotal?: number | null;
  travel_fee?: number | null;
  service_fee_amount?: number | null;
  service_fee_percentage?: number | null;
  service_fee_paid_by?: string | null;
  tip_amount?: number | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  discount_amount?: number | null;
  discount_code?: string | null;
  discount_reason?: string | null;
  promotion_discount_amount?: number | null;
  membership_discount_amount?: number | null;
  loyalty_discount_amount?: number | null;
  gift_card_amount?: number | null;
  wallet_amount?: number | null;
  cancellation_fee?: number | null;
  notes?: string;
  special_requests?: string | null;
  admin_notes?: string | null;
  house_call_instructions?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  is_group_booking?: boolean | null;
  package_id?: string | null;
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
  service_packages?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
  group_bookings?: { ref_number?: string | null } | { ref_number?: string | null }[] | null;
  booking_services?: BookingServiceRow[];
  booking_products?: BookingProductRow[];
  booking_addons?: BookingAddonRow[];
  additional_charges?: AdditionalChargeRow[];
  booking_tip_allocations?: TipAllocationRow[];
  payment_transaction?: { status?: string; amount?: number; transaction_id?: string } | null;
}

function firstRel<T>(x: T | T[] | null | undefined): T | undefined {
  if (x == null) return undefined;
  return Array.isArray(x) ? x[0] : x;
}

function offeringOf(s: BookingServiceRow): OfferingEmbed | undefined {
  return firstRel(s.offerings as OfferingEmbed | OfferingEmbed[] | null | undefined);
}

function staffOf(s: BookingServiceRow) {
  return firstRel(s.staff as { id?: string; name?: string | null; role?: string | null } | undefined);
}

function productOf(p: BookingProductRow) {
  return firstRel(p.products as { id?: string; name?: string; retail_price?: number } | undefined);
}

function variantOf(p: BookingProductRow) {
  return firstRel(p.product_variant as { id?: string; option_values?: unknown } | undefined);
}

function serviceLabel(s: BookingServiceRow): string {
  const o = offeringOf(s);
  const base = o?.title ?? "Service";
  const vn = o?.variant_name?.trim();
  if (vn) return `${base} — ${vn}`;
  if (o?.service_type === "variant" && o?.title) return o.title;
  return base;
}

function variantSubtitle(s: BookingServiceRow): string | null {
  const o = offeringOf(s);
  if (!o) return null;
  if (o.service_type === "variant" && o.parent_service_id) {
    return "Variant offering";
  }
  return null;
}

const MONEY_TOL = 0.02;

function sumAdditionalChargesForDisplay(charges: AdditionalChargeRow[] | undefined): number {
  if (!charges?.length) return 0;
  return charges.reduce((s, c) => {
    const st = (c.status || "").toLowerCase();
    if (st === "rejected" || st === "cancelled") return s;
    return s + (Number(c.amount) || 0);
  }, 0);
}

/**
 * DB trigger expects: total = subtotal - discount + tax + platform_fee + travel_fee + tip - cancellation_fee.
 * Some legacy rows store subtotal as (services + travel) while travel_fee is also set — avoid showing travel twice in UI.
 */
function travelFeeDoubleListed(
  dbSubtotal: number,
  servicesAndBundledSubtotal: number,
  travelFee: number
): boolean {
  if (!(travelFee > 0)) return false;
  return Math.abs(dbSubtotal - servicesAndBundledSubtotal - travelFee) < MONEY_TOL;
}

function formatVariantOptions(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return formatVariantOptions(p);
    } catch {
      return raw;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
  }
  return String(raw);
}

function money(currency: string, n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${currency} ${Number(n).toFixed(2)}`;
}

function cityField(b: BookingDetail): string {
  return (b.address_city ?? b.city ?? "").trim();
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
  useAdminBreadcrumbLeaf(booking?.booking_number ? `#${booking.booking_number}` : undefined);

  const saveMutation = useMutation({
    mutationFn: (body: Partial<BookingDetail>) => adminApi.patchJson<BookingDetail>(`/api/admin/bookings/${bookingId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.detail(bookingId) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.all() });
      setIsEditing(false);
      adminToast.success("Booking updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to save booking: ${e.message}`),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string | undefined) =>
      adminApi.postJson(`/api/admin/bookings/${bookingId}/cancel`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.detail(bookingId) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.all() });
      setShowCancel(false);
      setCancelReason("");
      adminToast.success("Booking cancelled");
    },
    onError: (e: Error) => adminToast.error(`Failed to cancel booking: ${e.message}`),
  });

  const refundMutation = useMutation({
    mutationFn: (payload: { amount: number; reason?: string }) =>
      adminApi.postJson(`/api/admin/bookings/${bookingId}/refund`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.detail(bookingId) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.all() });
      setShowRefund(false);
      setRefundReason("");
      adminToast.success("Refund initiated successfully");
    },
    onError: (e: Error) => adminToast.error(`Refund failed: ${e.message}`),
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
          <Link to={adminSpaTo("/admin/bookings")} className="text-sm font-medium text-gray-900 underline">
            ← Back to bookings
          </Link>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Booking" />
        <EmptyState title="Booking not found" description={q.error.message} />
        <Link to={adminSpaTo("/admin/bookings")} className="text-sm font-medium text-gray-900 underline">
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
  const lineServicesSubtotal = booking.booking_services?.reduce((s, x) => s + (x.price || 0), 0) || 0;
  const productTotal = booking.booking_products?.reduce((s, x) => s + (x.total_price || 0), 0) || 0;
  const addonTotal = booking.booking_addons?.reduce((s, x) => s + (Number(x.price) || 0) * (x.quantity || 1), 0) || 0;
  const additionalChargesTotal = sumAdditionalChargesForDisplay(booking.additional_charges);
  const goodsBeforeTravel =
    lineServicesSubtotal + addonTotal + productTotal + additionalChargesTotal;
  const dbSubtotal =
    booking.subtotal != null && !Number.isNaN(Number(booking.subtotal)) ? Number(booking.subtotal) : goodsBeforeTravel;
  const travelFeeAmt = Number(booking.travel_fee ?? 0) || 0;
  const travelListedSeparately = !travelFeeDoubleListed(dbSubtotal, lineServicesSubtotal + addonTotal + productTotal, travelFeeAmt);
  const discountAmt = Number(booking.discount_amount ?? 0) || 0;
  const taxAmt = Number(booking.tax_amount ?? 0) || 0;
  const svcFeeAmt = Number(booking.service_fee_amount ?? 0) || 0;
  const tipAmt = Number(booking.tip_amount ?? 0) || 0;
  const cancelAmt = Number(booking.cancellation_fee ?? 0) || 0;
  const expectedTotalFromColumns =
    dbSubtotal - discountAmt + taxAmt + svcFeeAmt + travelFeeAmt + tipAmt - cancelAmt;
  const totalMismatch =
    booking.total_amount != null &&
    Math.abs(expectedTotalFromColumns - Number(booking.total_amount)) > MONEY_TOL;
  const pkg = firstRel(booking.service_packages ?? undefined);
  const grp = firstRel(booking.group_bookings ?? undefined);

  const startEdit = () => {
    setEditData({ ...booking });
    setRefundAmount(booking.total_amount || 0);
    setIsEditing(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to={adminSpaTo("/admin/bookings")} className="text-sm text-gray-600 hover:text-gray-900">
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
                    address_city: editData.address_city ?? (editData as BookingDetail).city,
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

      {(pkg?.name || grp?.ref_number || booking.is_group_booking) ? (
        <AdminPanel className="border-indigo-100 bg-indigo-50/60">
          <div className="flex flex-wrap gap-4 text-sm text-indigo-950">
            {pkg?.name ? (
              <div>
                <span className="font-semibold">Package</span>
                <span className="ml-2">{pkg.name}</span>
              </div>
            ) : null}
            {grp?.ref_number ? (
              <div>
                <span className="font-semibold">Group booking</span>
                <span className="ml-2 font-mono">{grp.ref_number}</span>
              </div>
            ) : booking.is_group_booking ? (
              <div>
                <span className="font-semibold">Group booking</span>
                <span className="ml-2 text-indigo-800">Yes</span>
              </div>
            ) : null}
          </div>
        </AdminPanel>
      ) : null}

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
                        value={cityField(edit)}
                        onChange={(e) => setEditData({ ...editData, address_city: e.target.value })}
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
                {booking.location_type === "at_salon" && booking.location ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Salon / branch</dt>
                    <dd>
                      <span className="font-medium">{booking.location.name}</span>
                      <span className="text-gray-600">
                        {" "}
                        · {booking.location.address_line1}
                        {booking.location.city ? `, ${booking.location.city}` : ""}
                        {booking.location.country ? ` · ${booking.location.country}` : ""}
                      </span>
                    </dd>
                  </div>
                ) : null}
                {booking.location_type === "at_home" &&
                (booking.address_line1 ||
                  cityField(booking) ||
                  booking.address_line2 ||
                  booking.address_country) ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Service address</dt>
                    <dd className="whitespace-pre-wrap text-gray-800">
                      {[booking.address_line1, booking.address_line2, cityField(booking), booking.address_state, booking.address_postal_code, booking.address_country ?? booking.country]
                        .filter((x) => x != null && String(x).trim() !== "")
                        .join(", ")}
                    </dd>
                    {booking.house_call_instructions ? (
                      <p className="mt-2 text-xs text-gray-600">
                        <span className="font-medium text-gray-700">Instructions:</span> {booking.house_call_instructions}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {booking.status === "cancelled" && (booking.cancellation_reason || booking.cancelled_at) ? (
                  <div className="sm:col-span-2 rounded-lg border border-red-100 bg-red-50/80 px-3 py-2">
                    <dt className="text-xs font-medium text-red-900">Cancellation</dt>
                    <dd className="mt-1 text-sm text-red-950">
                      {booking.cancelled_at ? (
                        <span className="block">{new Date(booking.cancelled_at).toLocaleString()}</span>
                      ) : null}
                      {booking.cancellation_reason ? (
                        <span className="mt-1 block whitespace-pre-wrap">{booking.cancellation_reason}</span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {booking.special_requests ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Special requests</dt>
                    <dd className="whitespace-pre-wrap">{booking.special_requests}</dd>
                  </div>
                ) : null}
                {booking.notes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Notes</dt>
                    <dd className="whitespace-pre-wrap">{booking.notes}</dd>
                  </div>
                ) : null}
                {booking.admin_notes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Admin notes</dt>
                    <dd className="whitespace-pre-wrap text-amber-900">{booking.admin_notes}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </AdminPanel>

          <AdminPanel>
            <h2 className="mb-4 text-lg font-semibold">Services</h2>
            {booking.booking_services && booking.booking_services.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-3">Service</th>
                      <th className="py-2 pr-3">Staff</th>
                      <th className="py-2 pr-3">Slot</th>
                      <th className="py-2 pr-3">Duration</th>
                      <th className="py-2 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.booking_services.map((s) => {
                      const st = staffOf(s);
                      const slot =
                        s.scheduled_start_at && s.scheduled_end_at
                          ? `${new Date(s.scheduled_start_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })} → ${new Date(s.scheduled_end_at).toLocaleTimeString(undefined, { timeStyle: "short" })}`
                          : "—";
                      const sub = variantSubtitle(s);
                      return (
                        <tr key={s.id} className="border-b border-gray-100 align-top">
                          <td className="py-3 pr-3">
                            <div className="font-medium text-gray-900">{serviceLabel(s)}</div>
                            {sub ? <div className="text-xs text-gray-500">{sub}</div> : null}
                            {s.guest_name ? (
                              <div className="mt-1 text-xs text-gray-600">
                                Guest: <span className="font-medium">{s.guest_name}</span>
                              </div>
                            ) : null}
                            {s.customization ? (
                              <div className="mt-1 text-xs text-gray-600">
                                Customization: <span className="whitespace-pre-wrap">{s.customization}</span>
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3 text-gray-700">{st?.name ?? "—"}</td>
                          <td className="py-3 pr-3 text-xs text-gray-600">{slot}</td>
                          <td className="py-3 pr-3 tabular-nums text-gray-700">{s.duration_minutes != null ? `${s.duration_minutes} min` : "—"}</td>
                          <td className="py-3 text-right font-medium tabular-nums">{money(booking.currency, s.price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No services on this booking.</p>
            )}
          </AdminPanel>

          {booking.booking_addons && booking.booking_addons.length > 0 ? (
            <AdminPanel>
              <h2 className="mb-4 text-lg font-semibold">Add-ons</h2>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {booking.booking_addons.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {a.addon_name?.trim() || "Add-on"}
                      {a.quantity != null && a.quantity > 1 ? (
                        <span className="ml-2 text-gray-500">×{a.quantity}</span>
                      ) : null}
                    </span>
                    <span className="font-medium tabular-nums">{money(booking.currency, Number(a.price) * (a.quantity || 1))}</span>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          ) : null}

          <AdminPanel>
            <h2 className="mb-4 text-lg font-semibold">Retail products</h2>
            {booking.booking_products && booking.booking_products.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3">Variant</th>
                      <th className="py-2 pr-3">Qty</th>
                      <th className="py-2 pr-3">Unit</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.booking_products.map((p) => {
                      const prod = productOf(p);
                      const pv = variantOf(p);
                      const opts = formatVariantOptions(pv?.option_values);
                      return (
                        <tr key={p.id} className="border-b border-gray-100 align-top">
                          <td className="py-3 pr-3">
                            <div className="font-medium">{prod?.name ?? "Product"}</div>
                            {p.notes ? <div className="mt-1 text-xs text-gray-500">{p.notes}</div> : null}
                          </td>
                          <td className="py-3 pr-3 text-xs text-gray-700">{opts || (p.product_variant_id ? "—" : "Default")}</td>
                          <td className="py-3 pr-3 tabular-nums">{p.quantity ?? 1}</td>
                          <td className="py-3 pr-3 tabular-nums">{money(booking.currency, p.unit_price)}</td>
                          <td className="py-3 text-right font-medium tabular-nums">{money(booking.currency, p.total_price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No retail products.</p>
            )}
          </AdminPanel>

          {booking.additional_charges && booking.additional_charges.length > 0 ? (
            <AdminPanel>
              <h2 className="mb-4 text-lg font-semibold">Additional charges</h2>
              <ul className="divide-y divide-gray-100 rounded-lg border border-amber-100 bg-amber-50/40">
                {booking.additional_charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{c.description ?? "Charge"}</div>
                      <div className="text-xs text-gray-500">
                        {c.status}
                        {c.paid_at ? ` · paid ${new Date(c.paid_at).toLocaleString()}` : c.requested_at ? ` · requested ${new Date(c.requested_at).toLocaleString()}` : null}
                      </div>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">{money(c.currency || booking.currency, c.amount)}</span>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          ) : null}

          {booking.booking_tip_allocations && booking.booking_tip_allocations.length > 0 ? (
            <AdminPanel>
              <h2 className="mb-4 text-lg font-semibold">Tip allocation</h2>
              <p className="mb-3 text-xs text-gray-500">
                When the business splits tips across staff, amounts are recorded per team member. Total tip on the booking:{" "}
                <strong>{money(booking.currency, booking.tip_amount)}</strong>.
              </p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {booking.booking_tip_allocations.map((t) => {
                  const st = firstRel(t.staff);
                  return (
                    <li key={t.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                      <span>{st?.name ?? t.staff_id ?? "Staff"}</span>
                      <span className="font-medium tabular-nums">{money(booking.currency, t.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </AdminPanel>
          ) : null}

          {booking.payment_transaction ? (
            <AdminPanel>
              <h2 className="mb-2 text-lg font-semibold">Payment transaction</h2>
              <dl className="space-y-1 text-sm text-gray-700">
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="font-medium">{booking.payment_transaction.status ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Amount</dt>
                  <dd className="tabular-nums font-medium">
                    {booking.currency} {booking.payment_transaction.amount?.toFixed(2)}
                  </dd>
                </div>
                {booking.payment_transaction.transaction_id ? (
                  <div>
                    <dt className="text-gray-500">Transaction ID</dt>
                    <dd className="break-all font-mono text-xs">{booking.payment_transaction.transaction_id}</dd>
                  </div>
                ) : null}
              </dl>
            </AdminPanel>
          ) : null}
        </div>

        <div className="space-y-6">
          <AdminPanel>
            <h2 className="mb-3 text-lg font-semibold">Customer</h2>
            <p className="font-medium">{booking.customer?.full_name ?? "—"}</p>
            <p className="text-sm text-gray-600">{booking.customer?.email}</p>
            <Link
              to={adminSpaTo(`/admin/users/${booking.customer_id}`)}
              className="mt-3 inline-block text-sm font-medium text-gray-900 underline"
            >
              View customer profile →
            </Link>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-lg font-semibold">Provider</h2>
            <p className="font-medium">{booking.provider?.business_name ?? "—"}</p>
            <Link
              to={adminSpaTo(`/admin/providers/${booking.provider_id}`)}
              className="mt-3 inline-block text-sm font-medium text-gray-900 underline"
            >
              View provider profile →
            </Link>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-lg font-semibold">Pricing &amp; fees</h2>
            <p className="mb-3 text-xs text-gray-500">
              Line items below reconcile the stored <code className="font-mono">bookings.subtotal</code> with services,
              add-ons, products, and additional charges. Travel is usually added on top of subtotal in the DB total formula
              — if subtotal already includes travel, we only show travel once.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Services (line items)</dt>
                <dd className="tabular-nums font-medium">{money(booking.currency, lineServicesSubtotal)}</dd>
              </div>
              {addonTotal > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Add-ons</dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, addonTotal)}</dd>
                </div>
              ) : null}
              {productTotal > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Retail products</dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, productTotal)}</dd>
                </div>
              ) : null}
              {additionalChargesTotal > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Additional charges (approved / pending)</dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, additionalChargesTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-2">
                <dt className="text-gray-700">Recorded subtotal (`bookings.subtotal`)</dt>
                <dd className="tabular-nums font-medium">{money(booking.currency, dbSubtotal)}</dd>
              </div>
              {travelFeeAmt > 0 && !travelListedSeparately ? (
                <p className="text-xs text-gray-500">
                  Travel {money(booking.currency, travelFeeAmt)} is included in the recorded subtotal above (line items +
                  travel match subtotal). <code className="font-mono">travel_fee</code> is still stored separately for
                  routing and reporting.
                </p>
              ) : null}
              {travelListedSeparately ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Travel fee</dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, travelFeeAmt)}</dd>
                </div>
              ) : null}
              {(booking.service_fee_amount ?? 0) > 0 || booking.service_fee_percentage != null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">
                    Platform fee
                    {booking.service_fee_percentage != null ? ` (${Number(booking.service_fee_percentage).toFixed(2)}%)` : ""}
                    {booking.service_fee_paid_by ? ` · ${booking.service_fee_paid_by}` : ""}
                  </dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, booking.service_fee_amount)}</dd>
                </div>
              ) : null}
              {(booking.tax_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">
                    Tax
                    {booking.tax_rate != null ? ` (${Number(booking.tax_rate).toFixed(2)}%)` : ""}
                  </dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, booking.tax_amount)}</dd>
                </div>
              ) : null}
              {(booking.tip_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Tip</dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, booking.tip_amount)}</dd>
                </div>
              ) : null}
              {(booking.discount_amount ?? 0) > 0 ? (
                <div className="space-y-0.5 text-emerald-800">
                  <div className="flex justify-between gap-2">
                    <dt>
                      Discount
                      {booking.discount_code ? ` (${booking.discount_code})` : ""}
                    </dt>
                    <dd className="tabular-nums font-medium">−{booking.currency} {Number(booking.discount_amount).toFixed(2)}</dd>
                  </div>
                  {booking.discount_reason ? (
                    <p className="text-xs text-emerald-900/80">{booking.discount_reason}</p>
                  ) : null}
                </div>
              ) : null}
              {(booking.promotion_discount_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-2 text-emerald-800">
                  <dt>Promotion</dt>
                  <dd className="tabular-nums font-medium">−{booking.currency} {Number(booking.promotion_discount_amount).toFixed(2)}</dd>
                </div>
              ) : null}
              {(booking.membership_discount_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-2 text-emerald-800">
                  <dt>Membership discount</dt>
                  <dd className="tabular-nums font-medium">−{booking.currency} {Number(booking.membership_discount_amount).toFixed(2)}</dd>
                </div>
              ) : null}
              {(booking.loyalty_discount_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-2 text-emerald-800">
                  <dt>Loyalty discount</dt>
                  <dd className="tabular-nums font-medium">−{booking.currency} {Number(booking.loyalty_discount_amount).toFixed(2)}</dd>
                </div>
              ) : null}
              {(booking.gift_card_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Gift card applied</dt>
                  <dd className="tabular-nums font-medium">−{booking.currency} {Number(booking.gift_card_amount).toFixed(2)}</dd>
                </div>
              ) : null}
              {(booking.wallet_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Wallet applied</dt>
                  <dd className="tabular-nums font-medium">−{booking.currency} {Number(booking.wallet_amount).toFixed(2)}</dd>
                </div>
              ) : null}
              {(booking.cancellation_fee ?? 0) > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Cancellation fee</dt>
                  <dd className="tabular-nums font-medium">{money(booking.currency, booking.cancellation_fee)}</dd>
                </div>
              ) : null}
            </dl>
            {Math.abs(goodsBeforeTravel - dbSubtotal) > MONEY_TOL ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                <strong className="font-medium">Subtotal check:</strong> Sum of services, add-ons, products, and
                additional charges ({money(booking.currency, goodsBeforeTravel)}) does not match recorded{" "}
                <code className="font-mono">subtotal</code> ({money(booking.currency, dbSubtotal)}). Additional charges
                may be invoiced separately, or the row may need a data fix.
              </p>
            ) : null}
            {totalMismatch ? (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-950">
                <strong className="font-medium">Total reconciliation:</strong> Using{" "}
                <code className="font-mono">subtotal − discount + tax + platform_fee + travel_fee + tip − cancellation</code>{" "}
                gives {money(booking.currency, expectedTotalFromColumns)}, but <code className="font-mono">total_amount</code>{" "}
                is {money(booking.currency, booking.total_amount)}. If travel is double-counted (included in both{" "}
                <code className="font-mono">subtotal</code> and <code className="font-mono">travel_fee</code>), the stored
                columns may be inconsistent with the payment total.
              </p>
            ) : null}
            <div className="mt-4 border-t border-gray-200 pt-3">
              <div className="flex justify-between gap-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(booking.currency, booking.total_amount)}</span>
              </div>
              {booking.payment_status ? (
                <p className="mt-2 text-xs text-gray-500">Payment status: {booking.payment_status}</p>
              ) : null}
              {booking.payment_method ? (
                <p className="text-xs text-gray-500">Method: {booking.payment_method}</p>
              ) : null}
            </div>
          </AdminPanel>
        </div>
      </div>

      <BookingTrackingPanel bookingId={bookingId} enabled={allowed} />

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

// ---------------------------------------------------------------------------
// Tracking & activity (arrival, verification, provider location, timeline)
// ---------------------------------------------------------------------------

interface BookingTrackingData {
  booking_id: string;
  location_type: string | null;
  status: string | null;
  current_stage: string | null;
  precise_location_visible: boolean;
  lifecycle: {
    scheduled_at: string | null;
    confirmed_at: string | null;
    checked_in_time: string | null;
    provider_en_route_at: string | null;
    estimated_arrival: string | null;
    provider_arrived_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
  };
  arrival: {
    provider_arrived: boolean;
    customer_verified: boolean;
    verification_required: boolean;
    verification_method: "otp" | "qr" | "none";
    otp_present: boolean;
    otp_verified: boolean;
    otp_expired: boolean;
    qr_present: boolean;
    qr_verified: boolean;
    qr_expired: boolean;
    arrived_distance_m: number | null;
    last_distance_to_target_m: number | null;
  };
  tracking_state: {
    status: string | null;
    tracking_enabled: boolean;
    arrived_at_target: boolean;
    arrived_at: string | null;
    provider_last_at: string | null;
    last_distance_to_target_m: number | null;
    provider_last_lat: number | null;
    provider_last_lng: number | null;
  } | null;
  provider_location: { lat: number; lng: number; at: string | null } | null;
  destination: { lat: number; lng: number } | null;
  location_events: Array<{
    id: string;
    lat: number;
    lng: number;
    accuracy_m: number | null;
    speed_mps: number | null;
    heading_deg: number | null;
    recorded_at: string;
    source: string;
  }>;
  location_event_count: number;
  events: Array<{
    id: string;
    event_type: string;
    event_data: Record<string, unknown> | null;
    created_by: string | null;
    created_at: string;
  }>;
}

const EVENT_META: Record<string, { label: string; tone: "green" | "red" | "amber" | "blue" }> = {
  created: { label: "Booking created", tone: "blue" },
  confirmed: { label: "Confirmed", tone: "green" },
  provider_on_way: { label: "Provider started journey", tone: "blue" },
  provider_arrived: { label: "Provider marked arrived", tone: "blue" },
  service_started: { label: "Service started", tone: "blue" },
  service_completed: { label: "Service completed", tone: "green" },
  otp_sent: { label: "Verification code sent to customer", tone: "amber" },
  otp_verified: { label: "Customer verified arrival (code)", tone: "green" },
  qr_code_generated: { label: "QR code generated", tone: "amber" },
  qr_code_verified: { label: "Customer verified arrival (QR)", tone: "green" },
  arrival_verification_overridden: { label: "Arrival verification overridden", tone: "amber" },
  status_changed: { label: "Status changed", tone: "blue" },
  updated: { label: "Booking updated", tone: "blue" },
  rescheduled: { label: "Rescheduled", tone: "amber" },
  auto_rescheduled: { label: "Auto-rescheduled", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "red" },
  refunded: { label: "Refunded", tone: "red" },
  refund_issued: { label: "Refund issued", tone: "red" },
  payment_received: { label: "Payment received", tone: "green" },
  additional_payment_requested: { label: "Additional payment requested", tone: "amber" },
  additional_payment_approved: { label: "Additional payment approved", tone: "blue" },
  additional_payment_initiated: { label: "Additional payment initiated", tone: "blue" },
  additional_payment_paid: { label: "Additional payment paid", tone: "green" },
  additional_payment_failed: { label: "Additional payment failed", tone: "red" },
  recurring_occurrence_created: { label: "Recurring occurrence created", tone: "blue" },
  double_booking_override: { label: "Double-booking override", tone: "amber" },
  panic: { label: "Panic / SOS triggered", tone: "red" },
};

const OVERRIDE_REASON_LABELS: Record<string, string> = {
  customer_no_phone: "Customer had no phone / couldn't open the app",
  customer_technical_issue: "App or code wasn't working for the customer",
  customer_refused: "Customer declined to verify",
  other: "Other reason",
};

function eventMeta(type: string): { label: string; tone: "green" | "red" | "amber" | "blue" } {
  return (
    EVENT_META[type] ?? {
      label: type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      tone: "blue",
    }
  );
}

const TONE_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
  blue: "bg-blue-400",
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtDistance(m: number | null | undefined): string | null {
  if (m == null || Number.isNaN(Number(m))) return null;
  const v = Number(m);
  return v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`;
}

// Platform default map provider is Mapbox (not Google). Mapbox directions
// expects lng,lat order. Single point = destination only.
function mapboxPointUrl(lat: number, lng: number): string {
  return `https://www.mapbox.com/directions/?destination=${lng},${lat}`;
}

function mapboxRouteUrl(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): string {
  return `https://www.mapbox.com/directions/?destination=${dest.lng},${dest.lat}&origin=${origin.lng},${origin.lat}`;
}

function StatusBadge({ tone, children }: { tone: "green" | "red" | "amber" | "gray"; children: ReactNode }) {
  const cls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-800"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function VerificationLine({ arrival }: { arrival: BookingTrackingData["arrival"] }) {
  if (arrival.customer_verified) {
    // A code was issued and matched → genuine customer verification.
    if (arrival.verification_required) {
      return (
        <StatusBadge tone="green">
          ✓ Customer verified arrival{arrival.verification_method !== "none" ? ` (${arrival.verification_method.toUpperCase()})` : ""}
        </StatusBadge>
      );
    }
    // No code was issued (verification disabled / simple confirmation) — the
    // arrival flag was auto-set, the customer did not enter a code.
    return <StatusBadge tone="gray">Arrival auto-confirmed (no code required)</StatusBadge>;
  }
  if (arrival.verification_required) {
    const expired =
      (arrival.verification_method === "otp" && arrival.otp_expired) ||
      (arrival.verification_method === "qr" && arrival.qr_expired);
    if (expired) {
      return <StatusBadge tone="red">⚠ Verification code expired — customer never verified</StatusBadge>;
    }
    return <StatusBadge tone="amber">Awaiting customer verification ({arrival.verification_method.toUpperCase()})</StatusBadge>;
  }
  return <StatusBadge tone="gray">No arrival verification required</StatusBadge>;
}

function BookingTrackingPanel({ bookingId, enabled }: { bookingId: string; enabled: boolean }) {
  const q = useQuery({
    queryKey: adminQueryKeys.bookings.tracking(bookingId),
    queryFn: () =>
      adminApi.getJson<BookingTrackingData>(`/api/admin/bookings/${bookingId}/tracking`, { timeoutMs: 30_000 }),
    enabled: enabled && !!bookingId,
  });

  if (q.isLoading) {
    return (
      <AdminPanel>
        <h2 className="mb-4 text-lg font-semibold">Tracking &amp; activity</h2>
        <AdminPageSkeleton rows={4} />
      </AdminPanel>
    );
  }
  if (q.error) {
    return (
      <AdminPanel>
        <h2 className="mb-2 text-lg font-semibold">Tracking &amp; activity</h2>
        <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
      </AdminPanel>
    );
  }

  const data = q.data;
  if (!data) return null;

  const isAtHome = data.location_type === "at_home";
  const lifecycleSteps: Array<{ label: string; at: string | null; tone?: "red" }> = [
    { label: "Confirmed", at: data.lifecycle.confirmed_at },
    { label: "Checked in (salon)", at: data.lifecycle.checked_in_time },
    { label: "Provider en route", at: data.lifecycle.provider_en_route_at },
    { label: "Provider arrived", at: data.lifecycle.provider_arrived_at },
    { label: "Service started", at: data.lifecycle.started_at },
    { label: "Service completed", at: data.lifecycle.completed_at },
    { label: "Cancelled", at: data.lifecycle.cancelled_at, tone: "red" as const },
  ].filter((s) => s.at);

  const lastPing = data.location_events[0] ?? null;
  const distance = fmtDistance(data.arrival.last_distance_to_target_m ?? data.arrival.arrived_distance_m);

  // Most-recent manual arrival override (provider verified without the
  // customer's code). Surfaced prominently for dispute / safety review.
  const overrideEvent = [...data.events]
    .reverse()
    .find((ev) => ev.event_type === "arrival_verification_overridden");
  const ovd = (overrideEvent?.event_data ?? null) as {
    reason_code?: string;
    reason_text?: string | null;
    location?: { lat?: number; lng?: number } | null;
    distance_to_target_m?: number | null;
    overridden_by?: string | null;
  } | null;
  const ovdLat = ovd?.location?.lat;
  const ovdLng = ovd?.location?.lng;

  return (
    <AdminPanel>
      <h2 className="mb-1 text-lg font-semibold">Tracking &amp; activity</h2>
      <p className="mb-4 text-xs text-gray-500">
        Did the provider arrive, did the customer verify, and what happened on this booking — straight from the
        arrival, verification, and tracking records.
      </p>

      {/* Arrival & verification summary */}
      <div className="mb-5 flex flex-wrap gap-2">
        {data.arrival.provider_arrived ? (
          <StatusBadge tone="green">
            ✓ Provider arrived{data.lifecycle.provider_arrived_at ? ` · ${relTime(data.lifecycle.provider_arrived_at)}` : ""}
          </StatusBadge>
        ) : (
          <StatusBadge tone="gray">Provider not marked arrived</StatusBadge>
        )}
        {isAtHome || data.arrival.verification_required ? <VerificationLine arrival={data.arrival} /> : null}
        {data.tracking_state?.status ? (
          <StatusBadge tone="amber">Tracking: {data.tracking_state.status.replace(/_/g, " ")}</StatusBadge>
        ) : null}
        {distance ? <StatusBadge tone="gray">Distance to address: {distance}</StatusBadge> : null}
      </div>

      {/* Manual arrival override — prominent because it bypassed customer verification */}
      {overrideEvent ? (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-900">⚠ Arrival verified by manual override</span>
            <span className="text-xs text-amber-800">
              {fmtDateTime(overrideEvent.created_at)} · {relTime(overrideEvent.created_at)}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-amber-900">
            The provider marked arrival without the customer's verification code.
          </p>
          <dl className="mt-2 space-y-1 text-sm text-amber-900">
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Reason:</dt>
              <dd>{OVERRIDE_REASON_LABELS[ovd?.reason_code ?? ""] ?? ovd?.reason_code ?? "—"}</dd>
            </div>
            {ovd?.reason_text ? (
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">Detail:</dt>
                <dd className="italic">“{ovd.reason_text}”</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">By:</dt>
              <dd className="font-mono text-xs">{ovd?.overridden_by ?? overrideEvent.created_by ?? "—"}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="shrink-0 font-medium">Location:</dt>
              <dd>
                {ovdLat != null && ovdLng != null ? (
                  <>
                    <span className="font-mono text-xs">
                      {ovdLat.toFixed(5)}, {ovdLng.toFixed(5)}
                    </span>
                    {ovd?.distance_to_target_m != null ? (
                      <span className="ml-2 text-xs">({fmtDistance(ovd.distance_to_target_m)} from address)</span>
                    ) : null}
                    <a
                      href={mapboxPointUrl(ovdLat, ovdLng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs font-medium text-blue-700 underline"
                    >
                      Open ↗
                    </a>
                  </>
                ) : (
                  <span className="text-xs italic">No GPS captured at override time</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lifecycle timeline */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Lifecycle</h3>
          {lifecycleSteps.length === 0 ? (
            <p className="text-sm text-gray-500">No lifecycle timestamps recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {lifecycleSteps.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${s.tone === "red" ? "bg-red-500" : "bg-emerald-500"}`} />
                    <span className={s.tone === "red" ? "text-red-700" : "text-gray-700"}>{s.label}</span>
                  </span>
                  <span className="tabular-nums text-gray-500">{fmtDateTime(s.at)}</span>
                </li>
              ))}
            </ol>
          )}
          {data.lifecycle.estimated_arrival && !data.lifecycle.provider_arrived_at ? (
            <p className="mt-2 text-xs text-gray-500">ETA at customer: {fmtDateTime(data.lifecycle.estimated_arrival)}</p>
          ) : null}
        </div>

        {/* Provider location */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Provider location</h3>
          {data.precise_location_visible && data.provider_location ? (
            <div className="space-y-1 text-sm">
              <div className="font-mono text-gray-800">
                {data.provider_location.lat.toFixed(5)}, {data.provider_location.lng.toFixed(5)}
              </div>
              {data.provider_location.at ? (
                <div className="text-xs text-gray-500">Updated {relTime(data.provider_location.at)} · {fmtDateTime(data.provider_location.at)}</div>
              ) : null}
              <div className="flex flex-wrap gap-3 pt-1 text-xs">
                <a
                  href={mapboxPointUrl(data.provider_location.lat, data.provider_location.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 underline"
                >
                  Open last location ↗
                </a>
                {data.destination ? (
                  <a
                    href={mapboxRouteUrl(
                      { lat: data.provider_location.lat, lng: data.provider_location.lng },
                      { lat: data.destination.lat, lng: data.destination.lng },
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-700 underline"
                  >
                    Route to address ↗
                  </a>
                ) : null}
              </div>
              <p className="pt-1 text-xs text-gray-500">
                {data.location_event_count.toLocaleString()} GPS ping{data.location_event_count === 1 ? "" : "s"} recorded
                {lastPing ? ` · last ${relTime(lastPing.recorded_at)}` : ""}
              </p>
            </div>
          ) : data.location_event_count > 0 ? (
            <p className="text-sm text-gray-600">
              {data.location_event_count.toLocaleString()} GPS ping{data.location_event_count === 1 ? "" : "s"} recorded for
              this booking, but no current live coordinate is available.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {isAtHome ? "No live location recorded for this booking." : "Location tracking applies to at-home bookings."}
            </p>
          )}
        </div>
      </div>

      {/* Activity log */}
      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Activity log</h3>
        {data.events.length === 0 ? (
          <p className="text-sm text-gray-500">No activity events recorded.</p>
        ) : (
          <ul className="space-y-2.5">
            {[...data.events].reverse().map((ev) => {
              const meta = eventMeta(ev.event_type);
              return (
                <li key={ev.id} className="flex items-start gap-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[meta.tone]}`} />
                  <div className="min-w-0">
                    <span className={meta.tone === "red" ? "font-medium text-red-700" : "text-gray-800"}>{meta.label}</span>
                    <span className="ml-2 text-xs tabular-nums text-gray-400">
                      {fmtDateTime(ev.created_at)} · {relTime(ev.created_at)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminPanel>
  );
}
