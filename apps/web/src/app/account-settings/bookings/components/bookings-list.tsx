"use client";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { Booking } from "@/types/beautonomi";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Calendar, MapPin, Clock, User, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface BookingsListProps {
  status?: "upcoming" | "past" | "cancelled";
  /** Increment to force refetch (e.g. when realtime update received) */
  refreshTrigger?: number;
}

export default function BookingsList({ status, refreshTrigger }: BookingsListProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadBookings = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const params = status ? `?status=${status}` : "";
        const response = await fetcher.get<{
          data: {
            items: Booking[];
            total: number;
            page: number;
            limit: number;
            has_more: boolean;
          };
          error: null;
        }>(`/api/me/bookings${params}`, { cache: "no-store" });

        // Handle paginated response - extract items array
        const bookingsData = response.data?.items || response.data || [];
        setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load bookings";
        setError(errorMessage);
        console.error("Error loading bookings:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadBookings();
  }, [status, refreshTrigger]);

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
      <div className="py-8">
        <LoadingTimeout loadingMessage="Loading bookings..." />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load bookings"
        description={error}
        action={{
          label: "Retry",
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (bookings.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center py-12 md:py-16"
      >
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 mb-6"
        >
          <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-[#FF0077]" />
        </motion.div>
        <h3 className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 mb-3">
          No appointments scheduled...yet!
        </h3>
        <p className="text-base md:text-lg font-light text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
          Unveil your radiance and step into a world of luxury. It&apos;s time to
          pamper yourself and embrace your true beauty with our expert care.
        </p>
        <Link href="/search" className="inline-block">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-semibold px-8 py-6 text-base shadow-lg hover:shadow-xl transition-all"
            >
              Start Searching
            </Button>
          </motion.div>
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {bookings.map((booking, index) => (
        <motion.div
          key={booking.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          whileHover={{ scale: 1.01, y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-6 md:p-8 shadow-lg hover:shadow-2xl transition-all duration-300"
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                <h3 className="text-lg md:text-xl font-semibold text-gray-900">
                  {(booking as any).provider_name || booking.services?.[0]?.offering_name || "Beauty Service"}
                </h3>
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-tight ${
                    booking.status === "confirmed"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : booking.status === "pending"
                      ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                      : booking.status === "cancelled"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-gray-50 text-gray-700 border border-gray-200"
                  }`}
                >
                  {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                </span>
              </div>

              <div className="space-y-3 text-sm md:text-base text-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-pink-50 border border-pink-100">
                    <Calendar className="w-4 h-4 text-[#FF0077]" />
                  </div>
                  <span className="break-words font-medium">{formatDate(booking.scheduled_at)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-pink-50 border border-pink-100">
                    <Clock className="w-4 h-4 text-[#FF0077]" />
                  </div>
                  <span className="font-medium">{formatTime(booking.scheduled_at)}</span>
                </div>
                {booking.location_type === "at_salon" && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-pink-50 border border-pink-100">
                      <MapPin className="w-4 h-4 text-[#FF0077]" />
                    </div>
                    <span className="font-medium">At Salon</span>
                  </div>
                )}
                {booking.location_type === "at_home" && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-pink-50 border border-pink-100">
                      <MapPin className="w-4 h-4 text-[#FF0077]" />
                    </div>
                    <span className="font-medium">At your location</span>
                  </div>
                )}
                {booking.services?.[0]?.staff_name && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-pink-50 border border-pink-100">
                      <User className="w-4 h-4 text-[#FF0077]" />
                    </div>
                    <span className="font-medium">{booking.services[0].staff_name}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200/50">
                <p className="text-xl md:text-2xl font-semibold text-gray-900 mb-1">
                  {booking.currency} {booking.total_amount?.toFixed(2)}
                </p>
                <p className="text-xs md:text-sm text-gray-500 font-light">
                  Booking #{booking.booking_number}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full sm:w-auto md:w-48 flex-shrink-0">
              <Link href={`/account-settings/bookings/${booking.id}`} className="w-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button 
                    variant="outline" 
                    className="w-full border-gray-300 hover:border-[#FF0077] hover:text-[#FF0077] transition-colors"
                  >
                    View Details
                  </Button>
                </motion.div>
              </Link>
              {booking.status === "confirmed" && (
                <>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      className="w-full bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-semibold shadow-md hover:shadow-lg transition-all"
                      onClick={() => {
                        router.push(
                          `/account-settings/bookings/${booking.id}/reschedule`
                        );
                      }}
                    >
                      Reschedule
                    </Button>
                  </motion.div>
                  <Link href={`/account-settings/bookings/${booking.id}`} className="w-full block">
                    <Button
                      variant="outline"
                      className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Cancel
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
