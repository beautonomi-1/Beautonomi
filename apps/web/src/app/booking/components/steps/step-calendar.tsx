"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin } from "lucide-react";
import { BookingState } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatDate, formatTime } from "@/lib/utils";
import { getTravelBuffer } from "@/lib/config/house-call-config";
import { useTranslation } from "@beautonomi/i18n";
import AddToWaitlistButton from "@/components/booking/AddToWaitlistButton";

interface StepCalendarProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  providerSlug: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  reason?: string;
}

interface AvailabilityData {
  date: string;
  slots: TimeSlot[];
}

export default function StepCalendar({
  bookingState,
  updateBookingState,
  onNext: _onNext,
  providerSlug: _providerSlug,
}: StepCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    bookingState.selectedDate || null
  );
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [_availableDates, _setAvailableDates] = useState<Date[]>([]);
  const { t } = useTranslation();

  // Calculate total duration including travel buffer for mobile
  const totalDuration = bookingState.selectedServices.reduce(
    (sum, service) => sum + service.duration,
    0
  ) + bookingState.selectedAddons.reduce((sum, addon) => sum + addon.duration, 0);

  // Use actual travel time if available, otherwise use configured default
  const travelBuffer = getTravelBuffer(bookingState.mode, bookingState.address?.travelTimeMinutes);

  useEffect(() => {
    if (selectedDate) {
      loadAvailability();
    }
  }, [selectedDate, bookingState.selectedServices, bookingState.mode, bookingState.address?.travelTimeMinutes]);

  // Use Supabase Realtime for instant updates instead of polling
  useEffect(() => {
    if (!selectedDate) return;

    // Refresh on window focus (user might have booked in another tab)
    const handleFocus = () => {
      loadAvailability();
    };
    window.addEventListener('focus', handleFocus);

    // Try to use Supabase Realtime for real-time updates
    let unsubscribe: (() => void) | null = null;
    
    const setupRealtime = async () => {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase/client');
        const { subscribeToBookings } = await import('@/lib/websocket/supabase-realtime');
        const supabase = getSupabaseClient();
        
        if (bookingState.providerId) {
          unsubscribe = subscribeToBookings(
            supabase,
            bookingState.providerId,
            (event) => {
              // Refresh availability when bookings or booking_services change
              if (
                event.type === 'booking_created' ||
                event.type === 'booking_cancelled' ||
                event.type === 'booking_services_changed' ||
                event.type === 'availability_changed'
              ) {
                loadAvailability();
              }
            }
          );
        }
      } catch (error) {
        console.warn('Realtime subscription failed, falling back to polling:', error);
        // Fallback to polling if Realtime fails
        const interval = setInterval(() => {
          loadAvailability();
        }, 30000);
        return () => clearInterval(interval);
      }
    };

    setupRealtime();

    return () => {
      window.removeEventListener('focus', handleFocus);
      if (unsubscribe) unsubscribe();
    };
  }, [selectedDate, bookingState.selectedServices, bookingState.mode, bookingState.providerId]);

  const loadAvailability = async () => {
    if (!selectedDate) return;

    try {
      setIsLoading(true);
      const staffId = bookingState.selectedServices[0]?.staffId;
      const dateStr = selectedDate.toISOString().split("T")[0];
      const mode = bookingState.mode || "salon";

      const response = await fetcher.get<{ data: AvailabilityData }>(
        `/api/availability?staffId=${staffId || "any"}&date=${dateStr}&mode=${mode}&duration=${totalDuration}&travelBuffer=${travelBuffer}`
      );

      setAvailability(response.data);
    } catch (error) {
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to load availability"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    updateBookingState({ selectedDate: date, selectedTimeSlot: null });
  };

  const handleTimeSelect = (time: string) => {
    updateBookingState({ selectedTimeSlot: time });
  };

  // Generate next 30 days
  const generateDates = () => {
    const dates: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const dates = generateDates();

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {t("booking.selectDateTime")}
        </h2>
        <p className="text-gray-600">
          {t("booking.selectDate")}
        </p>
        {bookingState.mode === "mobile" && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
            <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                House Call Service
              </p>
              <p className="text-xs text-blue-700 mt-1">
                A 30-minute travel buffer is included before and after your appointment
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Date Selection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          {t("booking.selectDate")}
        </h3>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {dates.map((date) => {
            const isSelected =
              selectedDate?.toDateString() === date.toDateString();
            const isToday = date.toDateString() === new Date().toDateString();
            const isPast = date < new Date() && !isToday;

            return (
              <button
                key={date.toISOString()}
                onClick={() => !isPast && handleDateSelect(date)}
                disabled={isPast}
                className={`flex-shrink-0 w-20 p-3 rounded-lg border-2 transition-all touch-target ${
                  isSelected
                    ? "border-[#FF0077] bg-pink-50"
                    : isPast
                    ? "border-gray-100 bg-gray-50 opacity-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                aria-label={`Select ${formatDate(date)}`}
              >
                <div className="text-xs text-gray-600 mb-1">
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    isSelected ? "text-[#FF0077]" : "text-gray-900"
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="text-xs text-gray-500">
                  {date.toLocaleDateString("en-US", { month: "short" })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Slots */}
      {selectedDate && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Available Times
          </h3>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              Loading availability...
            </div>
          ) : availability && availability.slots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {availability.slots.map((slot) => {
                const isSelected = bookingState.selectedTimeSlot === slot.time;
                const isUnavailable = !slot.available;

                return (
                  <button
                    key={slot.time}
                    onClick={() => !isUnavailable && handleTimeSelect(slot.time)}
                    disabled={isUnavailable}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all touch-target ${
                      isSelected
                        ? "border-[#FF0077] bg-pink-50 text-[#FF0077]"
                        : isUnavailable
                        ? "border-gray-100 bg-gray-50 text-gray-400 opacity-50"
                        : "border-gray-200 bg-white text-gray-900 hover:border-gray-300"
                    }`}
                    aria-label={`Select ${formatTime(slot.time)}`}
                    title={slot.reason}
                  >
                    {formatTime(slot.time)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div>
                <p className="text-gray-500">No available slots for this date</p>
                <p className="text-sm mt-1 text-gray-400">Please select another date</p>
              </div>
              {bookingState.providerId && bookingState.selectedServices.length > 0 && (
                <div className="pt-4">
                  <AddToWaitlistButton
                    providerId={bookingState.providerId}
                    serviceId={bookingState.selectedServices[0]?.id}
                    staffId={bookingState.selectedServices[0]?.staffId}
                    preferredDate={selectedDate}
                    onSuccess={() => {
                      toast.success("Added to waitlist! We'll notify you when slots become available.");
                    }}
                    variant="outline"
                    size="default"
                    className="mx-auto"
                  />
                </div>
              )}
            </div>
          )}

          {bookingState.selectedTimeSlot && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 bg-green-50 border border-green-200 rounded-lg"
            >
              <p className="text-sm font-medium text-green-900">
                Selected: {formatDate(selectedDate)} at{" "}
                {formatTime(bookingState.selectedTimeSlot)}
              </p>
              {bookingState.mode === "mobile" && (
                <p className="text-xs text-green-700 mt-1">
                  Service duration: {totalDuration} min (includes travel time)
                </p>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
