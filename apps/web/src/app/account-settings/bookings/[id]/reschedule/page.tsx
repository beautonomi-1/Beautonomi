"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import type { Booking } from "@/types/beautonomi";
import { toast } from "sonner";
import AvailabilityCalendar from "@/app/checkout/components/availability-calendar";
import Breadcrumb from "../../../components/breadcrumb";
import BackButton from "../../../components/back-button";
import AuthGuard from "@/components/auth/auth-guard";

export default function RescheduleBookingPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (response.data.scheduled_at) {
          setSelectedDateTime(new Date(response.data.scheduled_at));
        }
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

  const handleReschedule = async () => {
    if (!selectedDateTime || !booking) {
      toast.error("Please select a new date and time");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetcher.post<{
        data: { booking: Booking; requires_confirmation: boolean };
        error: null;
      }>(`/api/me/bookings/${bookingId}/reschedule`, {
        new_datetime: selectedDateTime.toISOString(),
        reason: "Customer request",
      });

      toast.success(
        response.data.requires_confirmation
          ? "Reschedule request submitted. Provider will confirm the new time."
          : "Booking rescheduled successfully"
      );
      router.push(`/account-settings/bookings/${bookingId}`);
    } catch (err) {
      const errorMessage =
        err instanceof FetchError ? err.message : "Failed to reschedule booking";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
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

  return (
    <AuthGuard>
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <BackButton href={`/account-settings/bookings/${bookingId}`} label="Back to Booking" />
      <Breadcrumb 
        items={[
          { label: "Account", href: "/account-settings" },
          { label: "Bookings", href: "/account-settings/bookings" },
          { label: `Booking #${booking.booking_number}`, href: `/account-settings/bookings/${bookingId}` },
          { label: "Reschedule" }
        ]} 
      />

      <h1 className="text-2xl md:text-3xl font-semibold mb-4 md:mb-6 text-gray-900">Reschedule Booking</h1>

      {/* Current Booking Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Current Appointment</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-400" />
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
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">Time</p>
              <p className="font-medium">
                {new Date(booking.scheduled_at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* New Date/Time Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">Select New Date & Time</h2>
        <AvailabilityCalendar
          selectedProfessional={booking.services?.[0]?.staff_id || undefined}
          onDateTimeSelection={(dateTime) => {
            setSelectedDateTime(dateTime);
          }}
        />
        {selectedDateTime && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Selected time:</p>
            <p className="font-medium">
              {selectedDateTime.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
              at{" "}
              {selectedDateTime.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/account-settings/bookings/${bookingId}`)}
          className="w-full sm:flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleReschedule}
          disabled={!selectedDateTime || isSubmitting}
          className="w-full sm:flex-1 bg-gray-900 text-white hover:bg-gray-800"
        >
          {isSubmitting ? "Rescheduling..." : "Confirm Reschedule"}
        </Button>
      </div>
      </div>
    </AuthGuard>
  );
}
