"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, User, X, Plus, Printer } from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";
import {
  getGoogleCalendarUrl,
  getOutlookCalendarUrl,
  downloadICS,
} from "@/lib/calendar/ics";
import { PortalErrorState } from "../components/portal-error-state";
import { PortalBookingSkeleton } from "../components/portal-skeleton";

interface Booking {
  id: string;
  booking_number: string;
  scheduled_at: string;
  status: string;
  location_type: 'at_salon' | 'at_home';
  address?: {
    line1: string;
    city: string;
    country: string;
  };
  location?: {
    name: string;
    address: string;
  };
  services: Array<{
    title: string;
    duration_minutes: number;
    staff_name?: string;
  }>;
  provider: {
    name: string;
  };
  customer: {
    name: string;
    email: string;
  };
  total_duration_minutes?: number;
}

export default function PortalBookingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const normalizeError = (msg: string): string => {
    if (!msg) return "Unable to load booking. The link may be invalid or expired.";
    const lower = msg.toLowerCase();
    if (lower.includes("token not found") || lower.includes("invalid or expired")) {
      return "This link is invalid or has expired. Please use the link from your booking confirmation email or SMS.";
    }
    if (lower.includes("token required") || lower.includes("access token")) {
      return "No access link provided. Please use the link from your booking confirmation.";
    }
    if (lower.includes("booking not found")) {
      return "Booking not found. The link may be invalid or the booking may have been removed.";
    }
    return msg;
  };

  useEffect(() => {
    if (!token) {
      setError("no_token");
      setLoading(false);
      return;
    }

    loadBooking();
  }, [token]);

  const loadBooking = async () => {
    try {
      const response = await fetcher.get<{ data: Booking }>(
        `/api/portal/booking?token=${token}`
      );
      setBooking(response.data);
      setError(null);
    } catch (err: any) {
      setError(normalizeError(err?.message || "Failed to load booking"));
      toast.error(normalizeError(err?.message || "Failed to load booking"));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this booking?")) {
      return;
    }

    setActionLoading('cancel');
    try {
      await fetcher.post(`/api/portal/booking/cancel?token=${token}`);
      toast.success("Booking cancelled successfully");
      await loadBooking(); // Reload to show updated status
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel booking");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReschedule = () => {
    // Navigate to reschedule page with token
    router.push(`/portal/booking/reschedule?token=${token}`);
  };

  if (loading) {
    return <PortalBookingSkeleton />;
  }

  if (error || !booking) {
    return (
      <PortalErrorState
        error={error}
        isNoToken={error === "no_token"}
        onGoHome={() => router.push("/")}
        onLearnMore={() => router.push("/portal")}
      />
    );
  }

  const isCancelled = booking.status === 'cancelled';
  const isPast = new Date(booking.scheduled_at) < new Date();
  const printRef = useRef<HTMLDivElement>(null);

  const totalDuration = booking.total_duration_minutes ?? booking.services.reduce((s, svc) => s + svc.duration_minutes, 0);
  const startDate = new Date(booking.scheduled_at);
  const endDate = new Date(startDate.getTime() + totalDuration * 60000);
  const locationStr = booking.location_type === 'at_salon'
    ? booking.location?.name || booking.location?.address || 'Salon'
    : booking.address
    ? `${booking.address.line1}, ${booking.address.city}`
    : 'Address TBD';
  const calendarEvent = {
    title: `Beauty appointment with ${booking.provider.name}`,
    description: `Booking #${booking.booking_number}\n${booking.services.map(s => `${s.title} (${s.duration_minutes} min)`).join('\n')}`,
    location: locationStr,
    start: startDate,
    end: endDate,
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:py-4 print:bg-white">
      <div className="max-w-2xl mx-auto">
        <div ref={printRef} className="bg-white rounded-lg shadow-sm p-6 space-y-6 print:shadow-none">
          {/* Header with actions */}
          <div className="border-b pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 print:flex-row">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Booking Details</h1>
              <p className="text-gray-600 mt-1">Booking #{booking.booking_number}</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              {!isCancelled && !isPast && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(getGoogleCalendarUrl(calendarEvent), '_blank')}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Google
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(getOutlookCalendarUrl(calendarEvent), '_blank')}
                  >
                    Outlook
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { downloadICS(calendarEvent, `booking-${booking.booking_number}.ics`); toast.success('Calendar file downloaded'); }}
                  >
                    .ICS
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isCancelled 
                ? 'bg-red-100 text-red-800'
                : isPast
                ? 'bg-gray-100 text-gray-800'
                : 'bg-green-100 text-green-800'
            }`}>
              {isCancelled ? 'Cancelled' : isPast ? 'Completed' : 'Upcoming'}
            </span>
          </div>

          {/* Booking Info */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Date & Time</p>
                <p className="font-medium">
                  {formatDate(booking.scheduled_at)} at {formatTime(booking.scheduled_at)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Location</p>
                <p className="font-medium">
                  {booking.location_type === 'at_salon' 
                    ? booking.location?.name || 'Salon'
                    : booking.address 
                    ? `${booking.address.line1}, ${booking.address.city}`
                    : 'Address not provided'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Provider</p>
                <p className="font-medium">{booking.provider.name}</p>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="border-t pt-4">
            <h2 className="font-semibold text-gray-900 mb-3">Services</h2>
            <div className="space-y-2">
              {booking.services.map((service, idx) => (
                <div key={idx} className="flex justify-between items-center py-2">
                  <div>
                    <p className="font-medium">{service.title}</p>
                    {service.staff_name && (
                      <p className="text-sm text-gray-600">with {service.staff_name}</p>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{service.duration_minutes} min</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {!isCancelled && !isPast && (
            <div className="border-t pt-4 flex gap-3">
              <Button
                variant="outline"
                onClick={handleReschedule}
                className="flex-1"
              >
                Reschedule
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={actionLoading === 'cancel'}
                className="flex-1 text-red-600 hover:text-red-700"
              >
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Booking'}
              </Button>
            </div>
          )}

          {isCancelled && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 text-red-600">
                <X className="h-5 w-5" />
                <p className="font-medium">This booking has been cancelled</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
