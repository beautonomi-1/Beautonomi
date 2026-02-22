"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Mail,
  DollarSign,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { Booking, AdditionalCharge } from "@/types/beautonomi";
import { toast } from "sonner";
import Link from "next/link";
import { BookingAuditLog } from "@/components/provider/BookingAuditLog";
import { BookingConflictAlert } from "@/components/provider/BookingConflictAlert";

export default function ProviderBookingDetail() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState<string>("");
  const [isRequestingCharge, setIsRequestingCharge] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Mark paid state
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState("cash");
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Refund state
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  // Notes state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  useEffect(() => {
    loadBooking();
    loadAdditionalCharges();
  }, [bookingId]);

  const loadBooking = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: Booking }>(
        `/api/provider/bookings/${bookingId}`
      );
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

  const loadAdditionalCharges = async () => {
    try {
      const response = await fetcher.get<{ data: { charges: AdditionalCharge[] } }>(
        `/api/provider/bookings/${bookingId}/additional-charges`
      );
      setAdditionalCharges(response.data.charges || []);
    } catch (err) {
      console.error("Error loading additional charges:", err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!booking) return;

    try {
      setIsUpdating(true);
      setConflictError(null);
      const response = await fetcher.patch<{ booking: Booking; conflict?: boolean }>(
        `/api/provider/bookings/${bookingId}`,
        {
          status: newStatus,
          version: (booking as any).version, // Include version for conflict detection
        }
      );
      
      if (response.conflict) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
        return;
      }
      
      setBooking({ ...booking, status: newStatus as any, ...response.booking });
      toast.success("Booking status updated");
      loadBooking(); // Reload to get latest version
    } catch (error) {
      if (error instanceof FetchError && error.status === 409) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        toast.error("Failed to update booking status");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRequestAdditionalCharge = async () => {
    if (!chargeDescription.trim()) {
      toast.error("Please enter a description");
      return;
    }
    const amountNum = Number(chargeAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      setIsRequestingCharge(true);
      await fetcher.post(`/api/provider/bookings/${bookingId}/request-payment`, {
        description: chargeDescription.trim(),
        amount: amountNum,
      });
      toast.success("Additional payment requested");
      setChargeDescription("");
      setChargeAmount("");
      loadAdditionalCharges();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to request payment");
    } finally {
      setIsRequestingCharge(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleDate || !rescheduleTime) {
      toast.error("Please select both date and time");
      return;
    }
    try {
      setIsRescheduling(true);
      await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
        scheduled_at: `${rescheduleDate}T${rescheduleTime}:00`,
        version: (booking as any)?.version,
      });
      toast.success("Booking rescheduled");
      setShowReschedule(false);
      loadBooking();
    } catch (err) {
      if (err instanceof FetchError && err.status === 409) {
        setConflictError("This booking was modified. Please refresh and try again.");
      } else {
        toast.error("Failed to reschedule");
      }
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleMarkPaid = async () => {
    try {
      setIsMarkingPaid(true);
      await fetcher.post(`/api/provider/bookings/${bookingId}/mark-paid`, {
        payment_method: markPaidMethod,
      });
      toast.success("Booking marked as paid");
      setShowMarkPaid(false);
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to mark as paid");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleRefund = async () => {
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Please enter a valid refund amount");
      return;
    }
    try {
      setIsRefunding(true);
      await fetcher.post(`/api/provider/bookings/${bookingId}/refund`, {
        amount,
      });
      toast.success("Refund processed");
      setShowRefund(false);
      setRefundAmount("");
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to process refund");
    } finally {
      setIsRefunding(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      setIsSavingNotes(true);
      await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
        special_requests: notesText,
        version: (booking as any)?.version,
      });
      toast.success("Notes saved");
      setEditingNotes(false);
      loadBooking();
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const isActive = ["pending", "booked", "confirmed"].includes(booking?.status ?? "");
  const isStarted = ["started", "in_progress"].includes(booking?.status ?? "");
  const totalPaid = (booking as any)?.total_paid ?? 0;
  const totalRefunded = (booking as any)?.total_refunded ?? 0;
  const totalAmount = (booking as any)?.total_amount ?? 0;
  const outstanding = totalAmount - totalPaid + totalRefunded;
  const canMarkPaid = outstanding > 0 && (booking?.status === "completed" || isStarted);
  const canRefund = totalPaid > 0 && totalRefunded < totalPaid;

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
            onClick: () => router.push("/provider/bookings"),
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/provider/bookings"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Bookings
          </Link>
          <BookingAuditLog bookingId={bookingId} />
        </div>

        {/* Conflict Alert */}
        {conflictError && (
          <BookingConflictAlert
            conflictMessage={conflictError}
            onRefresh={() => {
              setConflictError(null);
              loadBooking();
            }}
            onDismiss={() => setConflictError(null)}
          />
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">
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
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {booking.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Customer Info */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Customer Information</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-medium">{(booking as any).customer_name || "Guest"}</p>
              </div>
              {(booking as any).customer_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <a
                    href={`tel:${(booking as any).customer_phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {(booking as any).customer_phone}
                  </a>
                </div>
              )}
              {(booking as any).customer_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a
                    href={`mailto:${(booking as any).customer_email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {(booking as any).customer_email}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Booking Details */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Booking Details</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">
                    {new Date(booking.scheduled_at).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Time</p>
                  <p className="font-medium">
                    {new Date(booking.scheduled_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Location</p>
                  {booking.location_type === "at_salon" ? (
                    <p className="font-medium">
                      {(booking as any).location_name || "At Salon"}
                    </p>
                  ) : booking.address ? (
                    <div className="space-y-1">
                      <p className="font-medium">
                        {booking.address.line1}
                        {booking.address.line2 && `, ${booking.address.line2}`}
                      </p>
                      {booking.address.apartment_unit && (
                        <p className="text-sm text-gray-600">Unit: {booking.address.apartment_unit}</p>
                      )}
                      {booking.address.building_name && (
                        <p className="text-sm text-gray-600">Building: {booking.address.building_name}</p>
                      )}
                      {booking.address.floor_number && (
                        <p className="text-sm text-gray-600">Floor: {booking.address.floor_number}</p>
                      )}
                      <p className="text-sm text-gray-600">
                        {booking.address.city}
                        {booking.address.state && `, ${booking.address.state}`}
                        {booking.address.postal_code && ` ${booking.address.postal_code}`}
                      </p>
                      <p className="text-sm text-gray-600">{booking.address.country}</p>
                      {booking.address.access_codes && (
                        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                          <p className="text-xs font-medium text-gray-700">Access Codes:</p>
                          {typeof booking.address.access_codes === 'object' && (
                            <>
                              {booking.address.access_codes.gate && (
                                <p className="text-xs text-gray-600">Gate: {booking.address.access_codes.gate}</p>
                              )}
                              {booking.address.access_codes.buzzer && (
                                <p className="text-xs text-gray-600">Buzzer: {booking.address.access_codes.buzzer}</p>
                              )}
                              {booking.address.access_codes.door && (
                                <p className="text-xs text-gray-600">Door: {booking.address.access_codes.door}</p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {booking.address.parking_instructions && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-medium text-gray-700">Parking:</p>
                          <p className="text-xs text-gray-600">{booking.address.parking_instructions}</p>
                        </div>
                      )}
                      {booking.address.location_landmarks && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-medium text-gray-700">Landmarks:</p>
                          <p className="text-xs text-gray-600">{booking.address.location_landmarks}</p>
                        </div>
                      )}
                      {booking.address.latitude && booking.address.longitude && (
                        <a
                          href={`https://www.google.com/maps?q=${booking.address.latitude},${booking.address.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                        >
                          View on Google Maps →
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="font-medium">At customer location</p>
                  )}
                </div>
              </div>
              {(booking as any).staff_name && (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Assigned Staff</p>
                    <p className="font-medium">{(booking as any).staff_name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Services</h2>
          <div className="space-y-3">
            {booking.services?.map((service, index) => (
              <div
                key={index}
                className="flex justify-between items-center py-3 border-b last:border-0"
              >
                <div>
                  <p className="font-medium">{(service as any).offering_name || "Service"}</p>
                  {(service as any).duration && (
                    <p className="text-sm text-gray-600">{(service as any).duration} mins</p>
                  )}
                </div>
                {(service as any).price && (
                  <p className="font-medium">
                    {booking.currency} {((service as any).price).toFixed(2)}
                  </p>
                )}
              </div>
            ))}
            {(!booking.services || booking.services.length === 0) && (
              <p className="text-sm text-gray-500">No services</p>
            )}
          </div>
        </div>

        {/* Products */}
        {booking.products && booking.products.length > 0 && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Products</h2>
            <div className="space-y-3">
              {booking.products.map((product: any, index: number) => (
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

        {/* Special Requests & House Call Instructions */}
        {(booking.special_requests || (booking as any).house_call_instructions) && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Special Instructions</h2>
            <div className="space-y-4">
              {booking.special_requests && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">General Requests</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{booking.special_requests}</p>
                </div>
              )}
              {(booking as any).house_call_instructions && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-1">House Call Instructions</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{(booking as any).house_call_instructions}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Summary */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Payment Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">
                {booking.currency} {((booking as any).subtotal?.toFixed(2)) || "0.00"}
              </span>
            </div>
            {(booking as any).travel_fee && (booking as any).travel_fee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Travel Fee</span>
                <span className="font-medium">
                  {booking.currency} {((booking as any).travel_fee).toFixed(2)}
                </span>
              </div>
            )}
            {(booking as any).service_fee_amount && (booking as any).service_fee_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Service Fee</span>
                <span className="font-medium">
                  {booking.currency} {((booking as any).service_fee_amount).toFixed(2)}
                </span>
              </div>
            )}
            {(booking as any).tax_amount && (booking as any).tax_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {(booking as any).tax_rate && (booking as any).tax_rate > 0
                    ? `VAT (${((booking as any).tax_rate * 100).toFixed(1)}%)`
                    : "Tax"}
                </span>
                <span className="font-medium text-blue-600">
                  {booking.currency} {((booking as any).tax_amount).toFixed(2)}
                </span>
              </div>
            )}
            {(booking as any).tip_amount && (booking as any).tip_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tip</span>
                <span className="font-medium">
                  {booking.currency} {((booking as any).tip_amount).toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-semibold text-lg">
                  {booking.currency} {((booking as any).total_amount?.toFixed(2)) || "0.00"}
                </span>
              </div>
            </div>
            {(booking as any).tax_amount && (booking as any).tax_amount > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs text-gray-500">
                  {(booking as any).tax_rate && (booking as any).tax_rate > 0
                    ? `VAT (${((booking as any).tax_rate * 100).toFixed(1)}%) amount: `
                    : "Tax amount: "}
                  {booking.currency} {((booking as any).tax_amount).toFixed(2)}.
                  {(booking as any).tax_rate && (booking as any).tax_rate >= 0.15
                    ? " This amount must be remitted to SARS by the provider."
                    : ""}
                </p>
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

        {/* Additional Charges */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Additional Charges</h2>
            <Button variant="outline" onClick={loadAdditionalCharges}>
              Refresh
            </Button>
          </div>

          {additionalCharges.length === 0 ? (
            <p className="text-sm text-gray-600">No additional charges for this booking.</p>
          ) : (
            <div className="space-y-3">
              {additionalCharges.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 border rounded-lg ${
                    c.status === 'paid'
                      ? 'bg-green-50 border-green-200'
                      : c.status === 'pending' || c.status === 'approved'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="font-medium">{c.description}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {c.currency} {Number(c.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested: {c.requested_at ? new Date(c.requested_at).toLocaleString() : "N/A"}
                      </p>
                      {c.paid_at && (
                        <p className="text-xs text-green-600 mt-1">
                          Paid: {new Date(c.paid_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        c.status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : c.status === 'pending' || c.status === 'approved'
                          ? 'bg-yellow-100 text-yellow-800'
                          : c.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {(c.status === 'pending' || c.status === 'approved') && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-2">
                        Customer can pay online, or mark as paid if received payment:
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const paymentMethod = prompt(
                            "Payment method:\n1. cash\n2. card\n3. mobile\n4. bank_transfer\n5. other\n\nEnter number or method name:"
                          );
                          if (!paymentMethod) return;
                          
                          const methodMap: Record<string, string> = {
                            '1': 'cash',
                            '2': 'card',
                            '3': 'mobile',
                            '4': 'bank_transfer',
                            '5': 'other',
                          };
                          
                          const finalMethod = methodMap[paymentMethod.toLowerCase()] || paymentMethod.toLowerCase();
                          
                          if (!['cash', 'card', 'mobile', 'bank_transfer', 'other'].includes(finalMethod)) {
                            toast.error("Invalid payment method");
                            return;
                          }
                          
                          if (!confirm(`Mark charge of ${c.currency} ${Number(c.amount).toFixed(2)} as paid via ${finalMethod}?`)) return;
                          
                          try {
                            await fetcher.post(
                              `/api/provider/bookings/${bookingId}/additional-charges/${c.id}/mark-paid`,
                              {
                                payment_method: finalMethod,
                                notes: `Marked as paid by provider via ${finalMethod}`,
                              }
                            );
                            toast.success("Charge marked as paid");
                            loadAdditionalCharges();
                            loadBooking();
                          } catch (err) {
                            toast.error(err instanceof FetchError ? err.message : "Failed to mark as paid");
                          }
                        }}
                      >
                        Mark as Paid (Walk-in/In-Salon)
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {["in_progress", "completed"].includes(booking.status as any) && (
            <div className="mt-6 border-t pt-4">
              <h3 className="font-semibold mb-2">Request additional payment</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  placeholder="Description"
                  value={chargeDescription}
                  onChange={(e) => setChargeDescription(e.target.value)}
                  className="md:col-span-2"
                />
                <Input
                  placeholder="Amount"
                  inputMode="decimal"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                />
              </div>
              <Button
                className="mt-3"
                onClick={handleRequestAdditionalCharge}
                disabled={isRequestingCharge}
              >
                {isRequestingCharge ? "Requesting..." : "Request Payment"}
              </Button>
            </div>
          )}
        </div>

        {/* Payment Summary */}
        {booking.status !== "pending" && (
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Payment Details</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total</span>
              <span className="font-medium">R {totalAmount.toFixed(2)}</span>
            </div>
            {totalPaid > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Paid</span>
                <span className="font-medium text-green-600">R {totalPaid.toFixed(2)}</span>
              </div>
            )}
            {totalRefunded > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Refunded</span>
                <span className="font-medium text-red-600">-R {totalRefunded.toFixed(2)}</span>
              </div>
            )}
            {outstanding > 0 && (
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-gray-700 font-medium">Outstanding</span>
                <span className="font-bold text-amber-600">R {outstanding.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Status Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {isActive && (
            <>
              <Button
                onClick={() => handleStatusChange("confirmed")}
                disabled={isUpdating || booking.status === "confirmed"}
                className="flex-1 bg-green-600 hover:bg-green-700 min-h-[44px] text-sm sm:text-base"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm
              </Button>
              <Button
                onClick={() => handleStatusChange("started")}
                disabled={isUpdating}
                className="flex-1 bg-blue-600 hover:bg-blue-700 min-h-[44px] text-sm sm:text-base"
              >
                Start Service
              </Button>
            </>
          )}
          {isStarted && (
            <Button
              onClick={() => handleStatusChange("completed")}
              disabled={isUpdating}
              className="flex-1 bg-green-600 hover:bg-green-700 min-h-[44px] text-sm sm:text-base"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Complete Booking
            </Button>
          )}
        </div>

        {/* Payment Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {canMarkPaid && (
            <Button
              onClick={() => setShowMarkPaid(true)}
              disabled={isUpdating}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Mark as Paid
            </Button>
          )}
          {canRefund && (
            <Button
              variant="outline"
              onClick={() => {
                setRefundAmount(totalPaid.toFixed(2));
                setShowRefund(true);
              }}
              disabled={isUpdating}
              className="flex-1 min-h-[44px]"
            >
              Issue Refund
            </Button>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {(isActive || isStarted) && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (booking.scheduled_at) {
                    const dt = new Date(booking.scheduled_at);
                    setRescheduleDate(dt.toISOString().slice(0, 10));
                    setRescheduleTime(dt.toISOString().slice(11, 16));
                  }
                  setShowReschedule(true);
                }}
                disabled={isUpdating}
                className="flex-1 min-h-[44px]"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Reschedule
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusChange("no_show")}
                disabled={isUpdating}
                className="flex-1 min-h-[44px] text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                No Show
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleStatusChange("cancelled")}
                disabled={isUpdating}
                className="flex-1 min-h-[44px]"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Notes / Special Requests</h3>
            {!editingNotes && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNotesText((booking as any)?.special_requests || "");
                  setEditingNotes(true);
                }}
              >
                Edit
              </Button>
            )}
          </div>
          {editingNotes ? (
            <div>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm min-h-[80px]"
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>
                  {isSavingNotes ? "Saving..." : "Save"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              {(booking as any)?.special_requests || "No notes"}
            </p>
          )}
        </div>

        {/* Reschedule Dialog */}
        {showReschedule && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Reschedule Booking</h3>
              <div>
                <label className="text-sm font-medium mb-1 block">Date</label>
                <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Time</label>
                <Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleReschedule} disabled={isRescheduling} className="flex-1">
                  {isRescheduling ? "Rescheduling..." : "Confirm Reschedule"}
                </Button>
                <Button variant="outline" onClick={() => setShowReschedule(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mark Paid Dialog */}
        {showMarkPaid && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Mark as Paid</h3>
              <p className="text-sm text-gray-600">Outstanding: R {outstanding.toFixed(2)}</p>
              <div>
                <label className="text-sm font-medium mb-1 block">Payment Method</label>
                <div className="flex gap-2">
                  {["cash", "card", "eft"].map((m) => (
                    <Button
                      key={m}
                      variant={markPaidMethod === m ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMarkPaidMethod(m)}
                      className="flex-1 capitalize"
                    >
                      {m === "eft" ? "EFT" : m}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleMarkPaid} disabled={isMarkingPaid} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  {isMarkingPaid ? "Processing..." : "Confirm Payment"}
                </Button>
                <Button variant="outline" onClick={() => setShowMarkPaid(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Refund Dialog */}
        {showRefund && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Issue Refund</h3>
              <p className="text-sm text-gray-600">Total paid: R {totalPaid.toFixed(2)}</p>
              <div>
                <label className="text-sm font-medium mb-1 block">Refund Amount (R)</label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  max={totalPaid}
                  step="0.01"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="destructive" onClick={handleRefund} disabled={isRefunding} className="flex-1">
                  {isRefunding ? "Processing..." : "Confirm Refund"}
                </Button>
                <Button variant="outline" onClick={() => setShowRefund(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
