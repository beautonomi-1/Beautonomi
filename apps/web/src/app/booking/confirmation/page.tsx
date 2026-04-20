"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Calendar, MapPin, Clock, Mail, Phone, Download, Share2, Plus, AlertCircle, Wallet, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { getGoogleCalendarUrl, getOutlookCalendarUrl, downloadICS } from "@/lib/calendar/ics";
import { formatCurrency } from "@/lib/utils";
import { formatBookingDateInTimeZone, formatBookingTimeInTimeZone } from "@/lib/bookings/display-datetime";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import LoadingTimeout from "@/components/ui/loading-timeout";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import { useRefreshAmplitudeIdentify } from "@/hooks/useAmplitude";
import { clearBookingFlowStorage } from "@/app/booking/components/booking-flow-persistence";

interface BookingDetails {
  id: string;
  booking_number: string;
  status: string;
  selected_datetime: string;
  location_type: "at_home" | "at_salon";
  total_amount: number;
  currency: string;
  wallet_amount?: number;
  total_paid?: number;
  /** Line items for parity with checkout summary (from `/api/me/bookings/[id]`). */
  subtotal?: number;
  tax_amount?: number;
  service_fee_amount?: number;
  travel_fee?: number;
  loyalty_discount_amount?: number;
  membership_discount_amount?: number;
  promotion_discount_amount?: number;
  discount_amount?: number;
  tip_amount?: number;
  gift_card_amount?: number;
  tax_rate?: number;
  loyalty_points_used?: number;
  outstanding_balance?: number;
  is_group_booking?: boolean;
  group_booking_ref?: string | null;
  services: Array<{
    title?: string;
    offering_name?: string;
    duration?: number;
    duration_minutes?: number;
    price: number;
    staff_name?: string;
    guest_name?: string | null;
  }>;
  additional_charges?: Array<{
    id: string;
    description?: string;
    amount: number;
    currency?: string;
    status?: string;
    requested_at?: string;
    paid_at?: string | null;
  }>;
  addons?: Array<{
    title: string;
    offering_name?: string;
    price: number;
    quantity?: number;
  }>;
  products?: Array<{
    product_name?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    country: string;
  };
  location?: {
    name: string;
    address: string;
  };
  client_info?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  special_requests?: string;
  payment_status?: string;
  payment_provider?: string;
  display_time_zone?: string | null;
  provider_id?: string;
  provider?: {
    id?: string;
    business_name: string;
    phone?: string;
    email?: string;
  };
}

export default function BookingConfirmationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get("bookingId");
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // §Customer-launch (audit 2026-04): track the terminal error's HTTP status
  // so we can distinguish "booking exists but I can't see it right now"
  // (transient / optimistic success UI is fine) from "you're not allowed to
  // see this booking" (401/403 — showing a green success tick would be a lie
  // and blocks the user from recovering with a sign-in prompt).
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const referralTracked = useRef(false);
  const refreshIdentify = useRefreshAmplitudeIdentify("client");

  useEffect(() => {
    clearBookingFlowStorage();
  }, []);

  useEffect(() => {
    if (!bookingId) {
      setError("Booking ID not found");
      setIsLoading(false);
      return;
    }

    const loadBooking = async () => {
      setIsLoading(true);
      // Retry up to 3 times with backoff — the booking may have just been written to DB
      const delays = [0, 1000, 2500];
      let lastErr: unknown = null;
      for (const delay of delays) {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        try {
          const response = await fetcher.get<{ data: BookingDetails }>(
            `/api/me/bookings/${bookingId}`
          );
          setBooking(response.data);
          refreshIdentify();
          setIsLoading(false);
          return;
        } catch (err) {
          lastErr = err;
          // Only retry on 404 (booking may not be visible yet); bail immediately on other errors
          if (err instanceof FetchError && err.status !== 404) break;
        }
      }
      const errorMessage =
        lastErr instanceof FetchError
          ? lastErr.message
          : "Failed to load booking details";
      setError(errorMessage);
      setErrorStatus(lastErr instanceof FetchError ? lastErr.status : null);
      console.error("Error loading booking:", lastErr);
      setIsLoading(false);
    };

    loadBooking();
  }, [bookingId]);

  // Attribute referral when booking is eligible (paid etc.). Only mark fired after success so
  // a failed "not yet paid" response can retry when the user returns after payment.
  useEffect(() => {
    if (!bookingId || !booking || referralTracked.current) return;
    fetcher
      .post("/api/me/referrals/track", { booking_id: bookingId })
      .then(() => {
        referralTracked.current = true;
      })
      .catch((err) => {
        if (
          err instanceof FetchError &&
          (err.status === 400 || err.status === 404 || err.status === 503)
        ) {
          return;
        }
      });
  }, [bookingId, booking]);

  const handleDownloadReceipt = () => {
    // Same-tab navigation keeps session cookies reliable (new tabs can race auth on some setups).
    const id = searchParams.get("bookingId") || searchParams.get("booking_id");
    if (id) {
      router.push(`/account-settings/bookings/${id}/receipt`);
    } else {
      window.print();
    }
  };

  const handleShare = async () => {
    if (!booking) return;
    const tz = booking.display_time_zone || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
    const dateLine = formatBookingDateInTimeZone(booking.selected_datetime, tz);
    const timeLine = formatBookingTimeInTimeZone(booking.selected_datetime, tz);
    const totalStr = formatCurrency(booking.total_amount, booking.currency);
    const providerName = booking.provider?.business_name || "the provider";
    const text = [
      `Booking #${booking.booking_number} — ${providerName}.`,
      `${dateLine}, ${timeLine}.`,
      `${booking.services.length} service(s). Total ${totalStr}.`,
    ].join(" ");
    const shareData = {
      title: `Booking Confirmation - ${booking.booking_number}`,
      text,
      url: window.location.href,
    };

    // §Customer-launch (audit 2026-04): previously the Share button was a
    // no-op on desktop (navigator.share doesn't exist). We now fall back to
    // clipboard copy so desktop users get something useful instead of a
    // dead button.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or denied – fall through to clipboard
      }
    }
    try {
      const clip = `${text} ${window.location.href}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clip);
        toast.success("Booking link copied to clipboard");
      } else {
        toast.info("Copy this link: " + window.location.href);
      }
    } catch {
      toast.error("Couldn't copy the booking link. Try again.");
    }
  };

  const totalDurationMinutes = booking?.services?.reduce((sum, s) => sum + (s.duration || s.duration_minutes || 0), 0) ?? 0;
  const bookingStart = booking?.selected_datetime ? new Date(booking.selected_datetime) : null;
  const bookingEnd = bookingStart
    ? new Date(bookingStart.getTime() + totalDurationMinutes * 60 * 1000)
    : null;
  const locationStr =
    !booking || booking.location_type === "at_home"
      ? booking?.address
        ? `${booking.address.line1}${booking.address.line2 ? `, ${booking.address.line2}` : ""}, ${booking.address.city}`
        : "Address TBD"
      : booking?.location?.address ?? booking?.location?.name ?? booking?.provider?.business_name ?? "Salon";
  const calendarEvent =
    bookingStart && bookingEnd
      ? {
          title: `Appointment with ${booking.provider?.business_name || "provider"}`,
          description: `Booking #${booking.booking_number}\n${booking.services?.map((s) => `${s.title || s.offering_name || "Service"} (${s.duration || s.duration_minutes || 0} min)`).join("\n") ?? ""}`,
          location: locationStr,
          start: bookingStart,
          end: bookingEnd,
        }
      : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <BeautonomiHeader />
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingTimeout loadingMessage="Loading booking confirmation..." />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    // §Customer-launch (audit 2026-04): only show the optimistic "Booking
    // Confirmed!" tick when the detail fetch failed transiently (e.g. the
    // booking isn't yet visible to our API user, or a 5xx).  For 401/403 we
    // cannot truthfully claim success — either the session is missing or
    // the user doesn't own this booking — so we show an auth/forbidden
    // error with a sign-in CTA instead.
    const isAuthError = errorStatus === 401 || errorStatus === 403;
    if (bookingId && isAuthError) {
      return (
        <div className="min-h-screen bg-white">
          <BeautonomiHeader />
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center max-w-md">
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                {errorStatus === 401 ? "Please sign in" : "You can't view this booking"}
              </h1>
              <p className="text-gray-600 mb-6">
                {errorStatus === 401
                  ? "Your session has expired. Sign in to view your booking."
                  : "This booking belongs to a different account. Sign in with the email you used to book, or head back home."}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => router.push(`/auth?redirect=${encodeURIComponent(`/booking/confirmation?bookingId=${bookingId}`)}`)}
                  className="bg-primary hover:bg-primary-hover"
                >
                  Sign in
                </Button>
                <Button variant="outline" onClick={() => router.push("/")}>Go Home</Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-white">
        <BeautonomiHeader />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center max-w-md">
            {/* Show success tick when booking was just created but details couldn't load transiently */}
            {bookingId ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Booking Confirmed!
                </h1>
                <p className="text-gray-500 text-sm mb-6">
                  Your booking was created successfully. We could not load the full details right now — check your email for a confirmation, or view your bookings below.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => router.push(bookingId ? `/account-settings/bookings/${bookingId}` : "/account-settings/bookings")}
                    className="bg-primary hover:bg-primary-hover"
                  >
                    View Booking
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/")}>
                    Go Home
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Booking Not Found
                </h1>
                <p className="text-gray-600 mb-6">{error || "Unable to load booking details"}</p>
                <Button onClick={() => router.push("/")} className="bg-primary hover:bg-primary-hover">
                  Go Home
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const bookingDateRaw = booking.selected_datetime;
  const bookingTz = booking.display_time_zone || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  const bookingDate = new Date(bookingDateRaw);

  return (
    <div className="min-h-screen bg-gray-50">
      <BeautonomiHeader />
      
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Success Header — status-aware */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="inline-block mb-4"
          >
            {booking.status === "confirmed" || booking.status === "completed" ? (
              <CheckCircle className="w-20 h-20 text-green-500" />
            ) : (
              <AlertCircle className="w-20 h-20 text-yellow-500" />
            )}
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {booking.status === "confirmed" || booking.status === "completed"
              ? "Booking Confirmed!"
              : "Booking Received!"}
          </h1>
          <p className="text-gray-600">
            {booking.status === "confirmed" || booking.status === "completed"
              ? <>Your booking has been confirmed. We&apos;ve sent a confirmation to{" "}{booking.client_info?.email || "your email"}.</>
              : "Your payment was received. Your booking is awaiting provider confirmation — you'll be notified once it's confirmed."}
          </p>
          {booking.status === "pending" && (
            <div className="mt-3 inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-full px-4 py-1.5 text-sm text-yellow-800">
              <Clock className="w-4 h-4" />
              Providers typically confirm within 8 hours
            </div>
          )}
          <p className="text-sm text-gray-500 mt-2">
            Booking #{booking.booking_number}
          </p>
          {booking.is_group_booking && booking.group_booking_ref && (
            <p className="text-sm text-gray-600 mt-2">
              Group reference: <span className="font-medium text-gray-800">{booking.group_booking_ref}</span>
            </p>
          )}
        </motion.div>

        {/* Booking Details Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-lg overflow-hidden mb-6"
        >
          <div className="p-6 space-y-6">
            {/* Date & Time */}
            <div className="flex items-start gap-4">
              <div className="p-3 bg-pink-50 rounded-lg">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Date & Time</h3>
                <p className="text-gray-600">{formatBookingDateInTimeZone(bookingDateRaw, bookingTz)}</p>
                <p className="text-gray-600">{formatBookingTimeInTimeZone(bookingDateRaw, bookingTz)}</p>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-4">
              <div className="p-3 bg-pink-50 rounded-lg">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {booking.location_type === "at_home" ? "House Call" : "At the Salon"}
                </h3>
                {booking.location_type === "at_home" && booking.address ? (
                  <p className="text-gray-600">
                    {booking.address.line1}
                    {booking.address.line2 && `, ${booking.address.line2}`}
                    <br />
                    {booking.address.city}, {booking.address.country}
                  </p>
                ) : booking.location ? (
                  <p className="text-gray-600">{booking.location.address}</p>
                ) : (
                  <p className="text-gray-600">{booking.provider?.business_name}</p>
                )}
              </div>
            </div>

            {/* Services */}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-900 mb-4">Services</h3>
              <div className="space-y-3">
                {booking.services.map((service, index) => {
                  const serviceTitle = service.title || service.offering_name || "Service";
                  const serviceDuration = service.duration || service.duration_minutes || 0;
                  return (
                    <div key={index} className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{serviceTitle}</p>
                        {service.guest_name && (
                          <p className="text-sm text-gray-600">Guest: {service.guest_name}</p>
                        )}
                        {service.staff_name && (
                          <p className="text-sm text-gray-600">with {service.staff_name}</p>
                        )}
                        {serviceDuration > 0 && (
                          <p className="text-sm text-gray-500">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {serviceDuration} min
                          </p>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(service.price, booking.currency)}
                      </p>
                    </div>
                  );
                })}
                {booking.addons && booking.addons.length > 0 && (
                  <>
                    {booking.addons.map((addon, index) => (
                      <div key={`addon-${index}`} className="flex justify-between items-start pl-4">
                        <div className="flex-1">
                          <p className="text-gray-600">+ {addon.title || addon.offering_name || "Add-on"}{(addon.quantity ?? 1) > 1 ? ` ×${addon.quantity}` : ""}</p>
                        </div>
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(addon.price * (addon.quantity ?? 1), booking.currency)}
                        </p>
                      </div>
                    ))}
                  </>
                )}
                {booking.products && booking.products.length > 0 && (
                  <>
                    {booking.products.map((product, index) => (
                      <div key={`product-${index}`} className="flex justify-between items-start pl-4">
                        <div className="flex-1">
                          <p className="text-gray-600">{product.product_name || "Product"}{product.quantity > 1 ? ` ×${product.quantity}` : ""}</p>
                        </div>
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(product.total_price, booking.currency)}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Additional charges (post-booking add-ons) */}
            {booking.additional_charges && booking.additional_charges.length > 0 && (
              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-3">Additional charges</h3>
                <div className="space-y-3">
                  {booking.additional_charges.map((charge) => {
                    const cur = charge.currency ?? booking.currency;
                    const unpaid =
                      charge.status === "pending" || charge.status === "approved";
                    return (
                      <div
                        key={charge.id}
                        className={`rounded-lg border p-3 text-sm ${
                          charge.status === "paid"
                            ? "bg-green-50 border-green-200"
                            : unpaid
                              ? "bg-amber-50 border-amber-200"
                              : charge.status === "rejected"
                                ? "bg-gray-50 border-gray-200"
                                : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{charge.description || "Additional charge"}</p>
                            <p className="text-gray-600 mt-0.5">{formatCurrency(charge.amount, cur)}</p>
                            {charge.paid_at && (
                              <p className="text-xs text-gray-500 mt-1">
                                Paid on {new Date(charge.paid_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          {charge.status && (
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium capitalize ${
                                charge.status === "paid"
                                  ? "bg-green-100 text-green-800"
                                  : unpaid
                                    ? "bg-amber-100 text-amber-900"
                                    : charge.status === "rejected"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {charge.status.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        {unpaid && bookingId && (
                          <Button
                            type="button"
                            size="sm"
                            className="mt-2 w-full sm:w-auto bg-primary hover:bg-primary-hover"
                            onClick={() =>
                              router.push(`/account-settings/bookings/${bookingId}/pay-additional/${charge.id}`)
                            }
                          >
                            Pay now
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price breakdown — matches checkout when fees/taxes/loyalty apply */}
            {(() => {
              const sub = booking.subtotal ?? 0;
              const tax = booking.tax_amount ?? 0;
              const taxRate = booking.tax_rate ?? 0;
              const svcFee = booking.service_fee_amount ?? 0;
              const travel = booking.travel_fee ?? 0;
              const loyalty = booking.loyalty_discount_amount ?? 0;
              const loyaltyPtsUsed = booking.loyalty_points_used ?? 0;
              const membership = booking.membership_discount_amount ?? 0;
              const promo = booking.promotion_discount_amount ?? 0;
              const coupon = booking.discount_amount ?? 0;
              const tip = booking.tip_amount ?? 0;
              const giftCard = booking.gift_card_amount ?? 0;
              const hasBreakdown =
                sub > 0 ||
                tax > 0 ||
                svcFee > 0 ||
                travel > 0 ||
                loyalty > 0 ||
                membership > 0 ||
                promo > 0 ||
                coupon > 0 ||
                tip > 0 ||
                giftCard > 0;
              if (!hasBreakdown) return null;
              return (
                <div className="border-t pt-4 space-y-1.5 text-sm">
                  <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                  {sub > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatCurrency(sub, booking.currency)}</span>
                    </div>
                  )}
                  {travel > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Travel</span>
                      <span>{formatCurrency(travel, booking.currency)}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>
                        Tax{taxRate > 0 ? ` (${taxRate}%)` : ""}
                      </span>
                      <span>{formatCurrency(tax, booking.currency)}</span>
                    </div>
                  )}
                  {svcFee > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Service fee</span>
                      <span>{formatCurrency(svcFee, booking.currency)}</span>
                    </div>
                  )}
                  {giftCard > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Gift card</span>
                      <span>−{formatCurrency(giftCard, booking.currency)}</span>
                    </div>
                  )}
                  {loyalty > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>
                        Loyalty{loyaltyPtsUsed > 0 ? ` (${loyaltyPtsUsed.toLocaleString()} pts)` : ""}
                      </span>
                      <span>−{formatCurrency(loyalty, booking.currency)}</span>
                    </div>
                  )}
                  {membership > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Membership</span>
                      <span>−{formatCurrency(membership, booking.currency)}</span>
                    </div>
                  )}
                  {promo > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Promotion</span>
                      <span>−{formatCurrency(promo, booking.currency)}</span>
                    </div>
                  )}
                  {coupon > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Discount</span>
                      <span>−{formatCurrency(coupon, booking.currency)}</span>
                    </div>
                  )}
                  {tip > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tip</span>
                      <span>{formatCurrency(tip, booking.currency)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Total */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(booking.total_amount, booking.currency)}
                </span>
              </div>
              {/* Show wallet credit if part of total was covered by wallet */}
              {(booking.wallet_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center text-sm text-green-700">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    Wallet credit applied
                  </span>
                  <span className="font-medium">−{formatCurrency(booking.wallet_amount!, booking.currency)}</span>
                </div>
              )}
              {(booking.wallet_amount ?? 0) > 0 && (booking.total_paid ?? 0) > 0 && (
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>Paid via card</span>
                  <span className="font-medium">{formatCurrency(booking.total_paid!, booking.currency)}</span>
                </div>
              )}
              {typeof booking.outstanding_balance === "number" && booking.outstanding_balance > 0 && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-sm text-amber-900 font-medium">
                    Amount due: {formatCurrency(booking.outstanding_balance, booking.currency)}
                  </p>
                </div>
              )}
              {booking.payment_provider === "cash" ? (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-sm text-amber-800 font-medium">
                    {booking.location_type === "at_home"
                      ? "Payment: Cash on arrival — you'll pay when your provider arrives."
                      : "Payment: Cash at the salon — you'll pay when you arrive."}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-1">
                  Payment status:{" "}
                  <span className={booking.payment_status === "paid" ? "text-green-600 font-medium" : "text-yellow-600 font-medium"}>
                    {booking.payment_status === "paid" ? "Paid in full" : booking.payment_status === "partially_paid" ? "Partially paid" : "Pending"}
                  </span>
                </p>
              )}
            </div>

            {/* Special Requests */}
            {booking.special_requests && (
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-2">Special Requests</h3>
                <p className="text-gray-600">{booking.special_requests}</p>
              </div>
            )}

            {/* Provider Contact */}
            {booking.provider && (
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Provider Contact</h3>
                <div className="space-y-2">
                  <p className="text-gray-900 font-medium">{booking.provider.business_name}</p>
                  {booking.provider.phone && (
                    <p className="text-gray-600 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {booking.provider.phone}
                    </p>
                  )}
                  {booking.provider.email && (
                    <p className="text-gray-600 flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      {booking.provider.email}
                    </p>
                  )}
                  {/*
                    §Customer-launch (audit 2026-04): deep-link into the
                    in-app messaging inbox preloaded with this provider +
                    booking context, so customers can reach the provider
                    immediately after booking without digging through menus.
                  */}
                  {(booking.provider.id || booking.provider_id) && (
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const pid = booking.provider?.id || booking.provider_id;
                          router.push(`/account-settings/messages?provider=${encodeURIComponent(pid!)}&bookingId=${encodeURIComponent(booking.id)}`);
                        }}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Message Provider
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Add to calendar */}
        {calendarEvent && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Add to your calendar</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(getGoogleCalendarUrl(calendarEvent), "_blank")}
              >
                <Plus className="w-4 h-4 mr-1" />
                Google Calendar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(getOutlookCalendarUrl(calendarEvent), "_blank")}
              >
                Outlook
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  downloadICS(calendarEvent, `booking-${booking.booking_number}.ics`);
                }}
              >
                .ICS file
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleDownloadReceipt}
            variant="outline"
            className="flex-1 touch-target"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Receipt
          </Button>
          <Button
            onClick={handleShare}
            variant="outline"
            className="flex-1 touch-target"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button
            onClick={() => router.push(bookingId ? `/account-settings/bookings/${bookingId}` : "/account-settings/bookings")}
            className="flex-1 bg-primary hover:bg-primary-hover touch-target"
          >
            View Booking
          </Button>
        </div>

        {/* Help Text — status-aware */}
        <div className={`mt-8 p-4 rounded-lg ${booking.status === "pending" ? "bg-yellow-50 border border-yellow-200" : "bg-blue-50"}`}>
          <p className={`text-sm ${booking.status === "pending" ? "text-yellow-900" : "text-blue-900"}`}>
            <strong>What&apos;s next?</strong>{" "}
            {booking.payment_provider === "cash"
              ? booking.location_type === "at_home"
                ? "Your provider will be on their way at the scheduled time. Have your cash ready for when they arrive."
                : "Simply arrive at the salon at your scheduled time and pay cash at the counter."
              : booking.status === "pending"
                ? "Your booking is waiting for the provider to confirm. You'll receive a notification once it's confirmed — this usually happens within 8 hours. If you need to make changes, visit your bookings page."
                : "You'll receive a confirmation email with all the details."}{" "}
            {booking.status !== "pending" && "If you need to make changes or cancel, please contact the provider directly or visit your bookings page."}
          </p>
        </div>
      </div>
    </div>
  );
}
