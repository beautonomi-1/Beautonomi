"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Calendar, MapPin, Clock, Mail, Phone, Download, Share2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { getGoogleCalendarUrl, getOutlookCalendarUrl, downloadICS } from "@/lib/calendar/ics";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
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
  services: Array<{
    title?: string;
    offering_name?: string;
    duration?: number;
    duration_minutes?: number;
    price: number;
    staff_name?: string;
  }>;
  addons?: Array<{
    title: string;
    price: number;
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
  provider?: {
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
      console.error("Error loading booking:", lastErr);
      setIsLoading(false);
    };

    loadBooking();
  }, [bookingId]);

  // Attribute referral conversion when user has referred_by and completes this booking (fire once)
  useEffect(() => {
    if (!bookingId || !booking || referralTracked.current) return;
    referralTracked.current = true;
    fetcher
      .post("/api/me/referrals/track", { booking_id: bookingId })
      .catch(() => {});
  }, [bookingId, booking]);

  const handleDownloadReceipt = () => {
    // Open receipt page in new tab for printing/saving as PDF
    const id = searchParams.get("bookingId") || searchParams.get("booking_id");
    if (id) {
      window.open(`/account-settings/bookings/${id}/receipt`, "_blank");
    } else {
      window.print();
    }
  };

  const handleShare = () => {
    if (navigator.share && booking) {
      navigator.share({
        title: `Booking Confirmation - ${booking.booking_number}`,
        text: `I've booked ${booking.services.length} service(s) with ${booking.provider?.business_name || "provider"}`,
        url: window.location.href,
      });
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
    return (
      <div className="min-h-screen bg-white">
        <BeautonomiHeader />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center max-w-md">
            {/* Show success tick when booking was just created but details couldn't load */}
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

  const bookingDate = new Date(booking.selected_datetime);

  return (
    <div className="min-h-screen bg-gray-50">
      <BeautonomiHeader />
      
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Success Header */}
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
            <CheckCircle className="w-20 h-20 text-green-500" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Booking Confirmed!
          </h1>
          <p className="text-gray-600">
            Your booking has been confirmed. We've sent a confirmation email to{" "}
            {booking.client_info?.email || "your email"}.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Booking #{booking.booking_number}
          </p>
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
                <p className="text-gray-600">{formatDate(bookingDate)}</p>
                <p className="text-gray-600">{formatTime(bookingDate.toISOString())}</p>
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
                          <p className="text-gray-600">+ {addon.title}</p>
                        </div>
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(addon.price, booking.currency)}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Total */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(booking.total_amount, booking.currency)}
                </span>
              </div>
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
                    {booking.payment_status === "paid" ? "Paid" : "Pending"}
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

        {/* Help Text */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>What's next?</strong>{" "}
            {booking.payment_provider === "cash"
              ? booking.location_type === "at_home"
                ? "Your provider will be on their way at the scheduled time. Have your cash ready for when they arrive."
                : "Simply arrive at the salon at your scheduled time and pay cash at the counter."
              : "You'll receive a confirmation email with all the details."}{" "}
            If you need to make changes or cancel, please contact the provider directly or visit
            your bookings page.
          </p>
        </div>
      </div>
    </div>
  );
}
