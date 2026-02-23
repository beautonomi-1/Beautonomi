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
} from "lucide-react";
import type { Booking } from "@/types/beautonomi";
import { toast } from "sonner";
import OrderDetailsDynamic from "@/app/checkout/components/order-details-dynamic";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import AuthGuard from "@/components/auth/auth-guard";
import { SafetyPanicButton } from "@/components/safety/SafetyPanicButton";

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const loadBooking = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetcher.get<{
          data: Booking;
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

  const handleCancel = async () => {
    if (!booking) return;

    const confirmed = window.confirm(
      "Are you sure you want to cancel this booking? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      setIsCancelling(true);
      const response = await fetcher.post<{
        data: { booking: Booking };
        error: null;
      }>(`/api/me/bookings/${bookingId}/cancel`, {
        reason: "Customer request",
        version: (booking as any).version, // Include version for conflict detection
      });

      setBooking(response.data.booking);
      toast.success("Booking cancelled successfully");
    } catch (err) {
      if (err instanceof FetchError && err.status === 409) {
        toast.error("This booking was modified by another user. Please refresh and try again.");
        // Reload booking to get latest version
        const refreshResponse = await fetcher.get<{
          data: Booking;
          error: null;
        }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
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

  return (
    <AuthGuard>
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
                    ? (booking as any).location?.name || (booking as any).location_name || "At Salon"
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
                {(booking as any).provider?.business_name || "Provider"}
              </p>
              {(booking as any).provider?.phone && (
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span>{(booking as any).provider.phone}</span>
                </div>
              )}
              {(booking as any).provider?.email && (
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  <span>{(booking as any).provider.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
      {(booking as any).products && (booking as any).products.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Products</h2>
          <div className="space-y-3">
            {(booking as any).products.map((product: any, index: number) => (
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
      {(booking as any).additional_charges && (booking as any).additional_charges.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Additional Charges</h2>
          <div className="space-y-3">
            {(booking as any).additional_charges.map((charge: any) => (
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
                    className="mt-2 w-full sm:w-auto bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
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
              {booking.currency} {booking.subtotal.toFixed(2)}
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
          {(booking as any).additional_charges && (booking as any).additional_charges.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium text-gray-700 mb-2">Additional Charges</p>
              {(booking as any).additional_charges
                .filter((c: any) => c.status !== 'rejected')
                .map((charge: any) => (
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
          {(booking as any).outstanding_balance !== undefined && (booking as any).outstanding_balance > 0 && (
            <div className="pt-2 border-t">
              <div className="flex justify-between">
                <span className="font-semibold text-orange-600">Outstanding Balance</span>
                <span className="font-semibold text-lg text-orange-600">
                  {booking.currency} {(booking as any).outstanding_balance.toFixed(2)}
                </span>
              </div>
            </div>
          )}
          <div className="flex justify-between text-sm text-gray-600 mt-2">
            <span>Payment Status</span>
            <span
              className={`font-medium ${
                booking.payment_status === "paid"
                  ? "text-green-600"
                  : booking.payment_status === "pending"
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {booking.payment_status}
            </span>
          </div>
        </div>
      </div>

      {/* Order Tracking (for at-home bookings) */}
      {booking.location_type === "at_home" && (
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
      </div>
    </AuthGuard>
  );
}
