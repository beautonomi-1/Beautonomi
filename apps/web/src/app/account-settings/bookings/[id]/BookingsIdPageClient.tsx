"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  MapPin,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle2,
  HelpCircle,
  Plus,
  Trophy,
  CreditCard,
} from "lucide-react";
import { getGoogleCalendarUrl } from "@/lib/calendar/ics";
import type { Booking } from "@/types/beautonomi";
import { formatBookingDateInTimeZone, formatBookingTimeInTimeZone } from "@/lib/bookings/display-datetime";

/** Booking as returned from GET /api/me/bookings/:id (includes expanded provider, location, etc.) */
type BookingDetail = Booking & {
  selected_datetime?: string;
  location?: { name?: string; address?: string };
  location_name?: string;
  provider?: { id?: string; business_name?: string; slug?: string; phone?: string; email?: string };
  outstanding_balance?: number;
  display_time_zone?: string | null;
};
import { toast } from "sonner";
import OrderDetailsDynamic from "@/app/checkout/components/order-details-dynamic";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import { SafetyPanicButton } from "@/components/safety/SafetyPanicButton";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const COMPLETION_MODAL_STORAGE_KEY = "booking_completion_modal_seen_";

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  const onDemandConfig = useModuleConfig("on_demand");
  const helpUrl = (onDemandConfig?.ui_copy as Record<string, string> | undefined)?.waiting_help_url?.trim();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isPayingOutstanding, setIsPayingOutstanding] = useState(false);

  useEffect(() => {
    const loadBooking = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetcher.get<{
          data: BookingDetail;
          error: null;
        }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });

        setBooking(response.data);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load booking";
        setError(errorMessage);
        console.error("Error loading booking:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (bookingId) {
      loadBooking();
    }
  }, [bookingId]);

  // Show post-completion modal once per booking when opening a completed booking
  useEffect(() => {
    if (!bookingId || !booking || booking.status !== "completed") return;
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(COMPLETION_MODAL_STORAGE_KEY + bookingId);
      if (!seen) setShowCompletionModal(true);
    } catch {
      // ignore storage errors
    }
  }, [bookingId, booking]);

  const dismissCompletionModal = (markSeen: boolean) => {
    if (markSeen && bookingId && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(COMPLETION_MODAL_STORAGE_KEY + bookingId, "1");
      } catch {
        // ignore
      }
    }
    setShowCompletionModal(false);
  };

  const handleCompletionWriteReview = () => {
    dismissCompletionModal(true);
    router.push(`/account-settings/bookings/${bookingId}/review`);
  };

  const handleCancel = async () => {
    if (!booking) return;

    let promptMessage =
      "Are you sure you want to cancel this booking? This action cannot be undone.";
    try {
      const preview = await fetcher.get<{
        data: {
          allowed: boolean;
          reason?: string;
          currency?: string;
          expected_cancellation_fee?: number;
          expected_wallet_refund?: number;
          is_late_cancellation?: boolean;
          refund_capped_by_paid_amount?: boolean;
        };
        error: null;
      }>(`/api/me/bookings/${bookingId}/cancel-preview`, { cache: "no-store", staleTimeMs: 0 });
      const p = preview.data;
      if (!p?.allowed) {
        toast.error(p?.reason || "Cancellation is not allowed for this booking.");
        return;
      }
      const cur = p.currency || booking.currency;
      const fee = Number(p.expected_cancellation_fee ?? 0);
      const refund = Number(p.expected_wallet_refund ?? 0);
      const capNote =
        p.refund_capped_by_paid_amount === true
          ? "\n\nYour wallet refund is capped by the amount you have already paid."
          : "";
      promptMessage =
        `Cancel this booking now?\n\n` +
        `Estimated cancellation fee: ${cur} ${fee.toFixed(2)}\n` +
        `Estimated wallet refund: ${cur} ${refund.toFixed(2)}` +
        capNote +
        `\n\n` +
        (p.is_late_cancellation
          ? "You are inside the late-cancellation window."
          : "You are within the normal cancellation window.");
    } catch {
      // Fallback to the generic confirmation text
    }

    const confirmed = window.confirm(promptMessage);
    if (!confirmed) return;

    try {
      setIsCancelling(true);
      const response = await fetcher.post<{
        data: { booking: BookingDetail };
        error: null;
      }>(`/api/me/bookings/${bookingId}/cancel`, {
        reason: "Customer request",
        version: booking.version, // Include version for conflict detection
      });

      setBooking(response.data.booking);
      toast.success("Booking cancelled successfully");
    } catch (err) {
      if (err instanceof FetchError && err.status === 409) {
        toast.error("This booking was modified by another user. Please refresh and try again.");
        // Reload booking to get latest version
        const refreshResponse = await fetcher.get<{
          data: BookingDetail;
          error: null;
        }>(`/api/me/bookings/${bookingId}`, { cache: "no-store", staleTimeMs: 0 });
        setBooking(refreshResponse.data);
      } else {
        const errorMessage =
          err instanceof FetchError ? err.message : "Failed to cancel booking";
        toast.error(errorMessage);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handlePayOutstanding = async () => {
    if (!bookingId) return;
    try {
      setIsPayingOutstanding(true);
      const res = await fetcher.post<{
        data: { authorization_url?: string };
        error: null;
      }>(`/api/me/bookings/${bookingId}/pay-remaining`, {}, { timeoutMs: 45000 });
      const url = res?.data?.authorization_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("Could not start payment.");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Could not start payment.");
    } finally {
      setIsPayingOutstanding(false);
    }
  };

  const bookingTz = booking?.display_time_zone ?? undefined;

  const formatDate = (dateString: string) => {
    return formatBookingDateInTimeZone(dateString, bookingTz);
  };

  const formatTime = (dateString: string) => {
    return formatBookingTimeInTimeZone(dateString, bookingTz);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading booking details..." />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Booking not found"
          description={error || "The booking you're looking for doesn't exist"}
          action={{
            label: "Go Back",
            onClick: () => router.push("/account-settings/bookings"),
          }}
        />
      </div>
    );
  }

  const canCancel =
    booking.status === "confirmed" || booking.status === "pending";
  const canReschedule = booking.status === "confirmed";
  const isActive = ["pending", "confirmed", "started", "in_progress"].includes(booking.status);
  const isCashBooking =
    (booking as unknown as Record<string, unknown>).payment_provider === "cash";
  const canPayOutstandingOnline =
    !isCashBooking &&
    booking.status !== "cancelled" &&
    (booking.outstanding_balance ?? 0) > 0 &&
    (booking.payment_status === "pending" || booking.payment_status === "partially_paid");
  const providerName = booking.provider?.business_name ?? "your provider";

  const scheduledAt = booking.selected_datetime ?? booking.scheduled_at;
  const totalDurationMinutes = booking.services?.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) ?? 0;
  const calendarStart = scheduledAt ? new Date(scheduledAt) : null;
  const calendarEnd = calendarStart ? new Date(calendarStart.getTime() + totalDurationMinutes * 60 * 1000) : null;
  const calendarLocation =
    booking.location_type === "at_salon"
      ? booking.location?.name || booking.location?.address || "Salon"
      : booking.address
        ? `${booking.address.line1}, ${booking.address.city}`
        : "Address TBD";
  const calendarEvent =
    calendarStart && calendarEnd
      ? {
          title: `Appointment with ${providerName}`,
          description: `Booking #${booking.booking_number}\n${booking.services?.map((s) => `${s.offering_name || "Service"} (${s.duration_minutes ?? 0} min)`).join("\n") ?? ""}`,
          location: calendarLocation,
          start: calendarStart,
          end: calendarEnd,
        }
      : null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <BackButton href="/account-settings/bookings" label="Back to Bookings" />
      {booking && (
        <Breadcrumb 
          items={[
            { label: "Account", href: "/account-settings" },
            { label: "Bookings", href: "/account-settings/bookings" },
            { label: `Booking #${booking.booking_number}` }
          ]} 
        />
      )}

      {isActive && (
        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-10 w-10 shrink-0 text-green-600" />
            <div>
              <p className="font-semibold text-gray-900">
                Booking confirmed {formatTime(booking.scheduled_at)}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                Your booking with {providerName} is confirmed.
              </p>
              {helpUrl && (
                <a
                  href={helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:underline"
                >
                  <HelpCircle className="h-4 w-4" />
                  Help
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-gray-900">
            Booking #{booking.booking_number}
          </h1>
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              booking.status === "confirmed"
                ? "bg-green-100 text-green-800"
                : booking.status === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : booking.status === "cancelled"
                ? "bg-red-100 text-red-800"
                : booking.status === "completed"
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {booking.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
        {/* Booking Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Booking Details</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Date</p>
                <p className="font-medium">{formatDate(booking.scheduled_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Time</p>
                <p className="font-medium">{formatTime(booking.scheduled_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Location</p>
                <p className="font-medium">
                  {booking.location_type === "at_salon"
                    ? booking.location?.name || booking.location_name || "At Salon"
                    : booking.address
                    ? `${booking.address.line1}, ${booking.address.city}`
                    : "At your location"}
                </p>
              </div>
            </div>
            {booking.services?.[0]?.staff_name && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Professional</p>
                  <p className="font-medium">{booking.services[0].staff_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Provider Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Provider</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-lg">
                {booking.provider?.business_name || "Provider"}
              </p>
              {booking.provider?.phone && (
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span>{booking.provider.phone}</span>
                </div>
              )}
              {booking.provider?.email && (
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  <span>{booking.provider.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {calendarEvent && booking.status !== "cancelled" && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-3 text-gray-900">Add to your calendar</h2>
          <p className="text-sm text-gray-600 mb-3">
            Open in Google Calendar in your browser, or download an .ics file for Apple Calendar, Outlook, and other apps
            (same options as the mobile app&apos;s calendar flow, adapted for web).
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={getGoogleCalendarUrl(calendarEvent)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              Google Calendar
            </a>
            <a
              href={`/api/me/bookings/${bookingId}/calendar.ics`}
              download
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Calendar className="w-4 h-4 mr-1" />
              Download .ics file
            </a>
          </div>
        </div>
      )}

      {/* Services */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Services</h2>
        <div className="space-y-3">
          {booking.services?.map((service, index) => (
            <div
              key={service.id || index}
              className="flex justify-between items-center py-3 border-b last:border-0"
            >
              <div>
                <p className="font-medium">{service.offering_name || "Service"}</p>
                <p className="text-sm text-gray-600">{service.duration_minutes} mins</p>
              </div>
              <p className="font-medium">
                {booking.currency} {service.price.toFixed(2)}
              </p>
            </div>
          ))}
          {(!booking.services || booking.services.length === 0) && (
            <p className="text-sm text-gray-500">No services</p>
          )}
        </div>
      </div>

      {/* Products */}
      {booking.products && booking.products.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Products</h2>
          <div className="space-y-3">
            {booking.products.map((product, index: number) => (
              <div
                key={product.id || index}
                className="flex justify-between items-center py-3 border-b last:border-0"
              >
                <div>
                  <p className="font-medium">{product.product_name || "Product"}</p>
                  <p className="text-sm text-gray-600">Quantity: {product.quantity}</p>
                </div>
                <p className="font-medium">
                  {booking.currency} {product.total_price.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Charges */}
      {booking.additional_charges && booking.additional_charges.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Additional Charges</h2>
          <div className="space-y-3">
            {booking.additional_charges.map((charge) => (
              <div
                key={charge.id}
                className={`p-4 border rounded-lg ${
                  charge.status === 'paid'
                    ? 'bg-green-50 border-green-200'
                    : charge.status === 'pending' || charge.status === 'approved'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{charge.description}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {charge.currency} {Number(charge.amount).toFixed(2)}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      charge.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : charge.status === 'pending' || charge.status === 'approved'
                        ? 'bg-yellow-100 text-yellow-800'
                        : charge.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {charge.status}
                  </span>
                </div>
                {(charge.status === 'pending' || charge.status === 'approved') && (
                  <Button
                    onClick={() => router.push(`/account-settings/bookings/${bookingId}/pay-additional/${charge.id}`)}
                    className="mt-2 w-full sm:w-auto bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white"
                  >
                    Pay Now
                  </Button>
                )}
                {charge.paid_at && (
                  <p className="text-xs text-gray-500 mt-2">
                    Paid on {new Date(charge.paid_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Payment Summary</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium">
              {booking.currency} {Math.max(0, booking.subtotal - (booking.travel_fee || 0)).toFixed(2)}
            </span>
          </div>
          {booking.tip_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Tip</span>
              <span className="font-medium">
                {booking.currency} {booking.tip_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.travel_fee > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Travel fee</span>
              <span className="font-medium">
                {booking.currency} {booking.travel_fee.toFixed(2)}
              </span>
            </div>
          )}
          {booking.discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">
                Discount{booking.discount_code ? ` (${booking.discount_code})` : ""}
              </span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.promotion_discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Promotion</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.promotion_discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.membership_discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Membership discount</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.membership_discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.loyalty_discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Loyalty points redeemed</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.loyalty_discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.gift_card_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Gift card</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.gift_card_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.wallet_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Wallet credit</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.wallet_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.tax_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Tax{booking.tax_rate > 0 ? ` (${booking.tax_rate}%)` : ""}</span>
              <span className="font-medium">
                {booking.currency} {booking.tax_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.service_fee_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">
                Service fee{booking.service_fee_percentage > 0 ? ` (${booking.service_fee_percentage}%)` : ""}
              </span>
              <span className="font-medium">
                {booking.currency} {booking.service_fee_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.additional_charges && booking.additional_charges.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium text-gray-700 mb-2">Additional Charges</p>
              {booking.additional_charges
                .filter((c) => c.status !== 'rejected')
                .map((charge) => (
                  <div key={charge.id} className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{charge.description}</span>
                    <span className={`font-medium ${
                      charge.status === 'paid' ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {charge.currency} {Number(charge.amount).toFixed(2)}
                      {charge.status !== 'paid' && ' (Pending)'}
                    </span>
                  </div>
                ))}
            </div>
          )}
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-semibold text-lg">
                {booking.currency} {booking.total_amount.toFixed(2)}
              </span>
            </div>
          </div>
          {booking.total_paid > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Amount paid</span>
              <span className="font-medium text-green-600">
                {booking.currency} {booking.total_paid.toFixed(2)}
              </span>
            </div>
          )}
          {booking.outstanding_balance !== undefined && booking.outstanding_balance > 0 && (
            <div className="pt-2 border-t">
              <div className="flex justify-between">
                <span className="font-semibold text-orange-600">Outstanding Balance</span>
                <span className="font-semibold text-lg text-orange-600">
                  {booking.currency} {booking.outstanding_balance.toFixed(2)}
                </span>
              </div>
              {isCashBooking ? (
                <p className="text-sm text-gray-600 mt-2">
                  {booking.location_type === "at_home"
                    ? "You will pay cash when your provider arrives."
                    : "You will pay cash at the salon."}
                </p>
              ) : canPayOutstandingOnline ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                    onClick={handlePayOutstanding}
                    disabled={isPayingOutstanding}
                  >
                    <CreditCard className="w-4 h-4 mr-2" aria-hidden />
                    {isPayingOutstanding ? "Processing…" : "Pay outstanding balance"}
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    Secure payment via Paystack. You will return here after paying.
                  </p>
                </div>
              ) : null}
            </div>
          )}
          <div className="flex justify-between text-sm text-gray-600 mt-2 pt-2 border-t">
            <span>Payment method</span>
            <span className="font-medium capitalize">
              {isCashBooking
                ? "Cash"
                : booking.payment_status === "paid"
                ? "Online"
                : "Online (pending)"}
            </span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Payment status</span>
            <span
              className={`font-medium ${
                booking.payment_status === "paid"
                  ? "text-green-600"
                  : booking.payment_status === "pending"
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {booking.payment_status === "paid"
                ? "Paid"
                : booking.payment_status === "partially_paid"
                ? "Partially paid"
                : booking.payment_status === "pending"
                ? isCashBooking
                  ? "Pay on arrival"
                  : "Pending"
                : booking.payment_status}
            </span>
          </div>
          {booking.loyalty_points_earned > 0 && booking.status === "completed" && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Loyalty points earned</span>
              <span className="font-medium text-primary">+{booking.loyalty_points_earned} pts</span>
            </div>
          )}
        </div>
      </div>

      {/* Order Tracking — at-home shows full tracker with OTP/ETA; at-salon shows simplified tracker */}
      {(booking.location_type === "at_home" || booking.location_type === "at_salon") && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <OrderDetailsDynamic bookingId={bookingId} booking={booking} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4 flex-wrap">
        <SafetyPanicButton bookingId={bookingId} />
        {canReschedule && (
          <Button
            variant="outline"
            onClick={() => router.push(`/account-settings/bookings/${bookingId}/reschedule`)}
            className="flex-1"
          >
            Reschedule
          </Button>
        )}
        {canCancel && (
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isCancelling}
            className="flex-1"
          >
            {isCancelling ? "Cancelling..." : "Cancel Booking"}
          </Button>
        )}
        {booking.status === "completed" && (
          <>
            <Button
              variant="outline"
              onClick={() => router.push(`/account-settings/bookings/${bookingId}/review`)}
              className="flex-1"
            >
              Write Review
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/account-settings/bookings/${bookingId}/receipt`)}
              className="flex-1"
            >
              View Receipt
            </Button>
          </>
        )}
        {booking.payment_status === "paid" && booking.status !== "completed" && (
          <Button
            variant="outline"
            onClick={() => router.push(`/account-settings/bookings/${bookingId}/receipt`)}
            className="flex-1"
          >
            View Receipt
          </Button>
        )}
      </div>

      {/* Post-completion modal: once per booking when opening a completed booking */}
      <Dialog open={showCompletionModal} onOpenChange={(open) => !open && dismissCompletionModal(true)}>
        <DialogContent className="sm:max-w-md" hideClose={false}>
          <DialogHeader>
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-primary/10 p-4">
                <Trophy className="h-10 w-10 text-primary" aria-hidden />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Booking complete</DialogTitle>
            <DialogDescription className="text-center">
              You’re all set. Thanks for booking with us.
              {(booking?.loyalty_points_earned ?? 0) > 0 && (
                <span className="mt-2 block font-medium text-primary">
                  You earned {booking.loyalty_points_earned} loyalty points. They’ve been added to your balance.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-col">
            <Button
              onClick={handleCompletionWriteReview}
              className="w-full"
            >
              Write a review
            </Button>
            <Button
              variant="outline"
              onClick={() => dismissCompletionModal(true)}
              className="w-full"
            >
              Maybe later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
