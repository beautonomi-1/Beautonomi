"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X } from "lucide-react";
import { PortalBookingSkeleton } from "../../components/portal-skeleton";
import { formatDate, formatTime } from "@/lib/utils";

interface TimeSlot {
  time: string;
  available: boolean;
  reason?: string;
}

interface Booking {
  id: string;
  booking_number: string;
  scheduled_at: string;
  location_type: 'at_salon' | 'at_home';
}

export default function PortalReschedulePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (selectedDate && booking) {
      loadAvailability();
    }
  }, [selectedDate, booking]);

  const loadBooking = async () => {
    try {
      const response = await fetcher.get<{ data: Booking }>(
        `/api/portal/booking?token=${token}`
      );
      setBooking(response.data);
      setSelectedDate(new Date(response.data.scheduled_at));
      setError(null);
    } catch (err: unknown) {
      const msg = normalizeError(err instanceof Error ? err.message : "Failed to load booking");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    if (!selectedDate || !booking) return;

    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await fetcher.get<{ data: { date: string; slots: TimeSlot[] } }>(
        `/api/portal/availability?token=${token}&date=${dateStr}`
      );
      setAvailability(response.data?.slots || []);
    } catch {
      toast.error("Failed to load availability");
    }
  };

  const handleReschedule = async () => {
    if (!selectedDate || !selectedTime || !booking) {
      toast.error("Please select a date and time");
      return;
    }

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const newDatetime = new Date(selectedDate);
    newDatetime.setHours(hours, minutes, 0, 0);

    setSubmitting(true);
    try {
      await fetcher.post(`/api/portal/booking/reschedule?token=${token}`, {
        new_datetime: newDatetime.toISOString(),
      });
      
      toast.success("Booking rescheduled successfully!");
      router.push(`/portal/booking?token=${token}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to reschedule booking");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <PortalBookingSkeleton />;
  }

  if (error || !booking) {
    const isNoToken = error === "no_token";
    const displayMessage = isNoToken
      ? "No booking link was provided. Use the link from your confirmation email or SMS to reschedule your booking."
      : (error || "Unable to load booking. The link may be invalid or expired.");

    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <X className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isNoToken ? "Missing Booking Link" : "Unable to Load Booking"}
          </h1>
          <p className="text-gray-600 mb-6">{displayMessage}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isNoToken && (
              <Button variant="outline" onClick={() => router.push("/portal")}>
                Learn how to access your booking
              </Button>
            )}
            <Button onClick={() => router.push("/")}>Go to Homepage</Button>
          </div>
        </div>
      </div>
    );
  }

  const availableSlots = availability.filter(slot => slot.available);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => router.push(`/portal/booking?token=${token}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Booking
        </Button>

        <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reschedule Booking</h1>
            <p className="text-gray-600 mt-1">Select a new date and time for your appointment</p>
          </div>

          {/* Current Booking */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Current Appointment</p>
            <p className="font-medium">
              {formatDate(booking.scheduled_at)} at {formatTime(booking.scheduled_at)}
            </p>
          </div>

          {/* Date Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate?.toISOString().split('T')[0] || ''}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>

          {/* Time Selection */}
          {selectedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Time
              </label>
              {availableSlots.length === 0 ? (
                <p className="text-gray-600 text-sm">No available slots for this date</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => setSelectedTime(slot.time)}
                      className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                        selectedTime === slot.time
                          ? 'border-pink-500 bg-pink-50 text-pink-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => router.push(`/portal/booking?token=${token}`)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={!selectedDate || !selectedTime || submitting}
              className="flex-1"
            >
              {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
