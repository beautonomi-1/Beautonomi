"use client";

import React, { useState, useEffect, useRef } from "react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Booking } from "@/types/beautonomi";

type BookingListItem = Booking & { provider_name?: string; services?: Array<{ offering_name?: string }> };
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Calendar, MapPin, Clock, User, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { getBookingLifecycleDisplay, getBookingPaymentDisplay } from "@beautonomi/utils";

interface BookingsListProps {
  status?: "upcoming" | "past" | "cancelled";
  refreshTrigger?: number;
  /** SSR-hydrated rows for the default upcoming + scheduled_desc view — skips one redundant client fetch. */
  initialSeed?: Booking[];
}

type SortMode = "scheduled_desc" | "scheduled_asc" | "created_desc" | "created_asc";
const BOOKINGS_PAGE_SIZE = 100;

function sortModeToQuery(m: SortMode): string {
  const map: Record<SortMode, [string, string]> = {
    scheduled_desc: ["scheduled_at", "desc"],
    scheduled_asc: ["scheduled_at", "asc"],
    created_desc: ["created_at", "desc"],
    created_asc: ["created_at", "asc"],
  };
  const [sort_by, sort_dir] = map[m];
  return `sort_by=${sort_by}&sort_dir=${sort_dir}`;
}

async function fetchAllBookingsPages(status: BookingsListProps["status"], sortMode: SortMode) {
  const bookings: Booking[] = [];
  const sortQs = sortModeToQuery(sortMode);

  for (let page = 1; ; page += 1) {
    const params = status
      ? `?status=${encodeURIComponent(status)}&limit=${BOOKINGS_PAGE_SIZE}&page=${page}&${sortQs}`
      : `?limit=${BOOKINGS_PAGE_SIZE}&page=${page}&${sortQs}`;
    const response = await fetcher.get<{
      data: {
        items: Booking[];
        total: number;
        page: number;
        limit: number;
        has_more: boolean;
      };
      error: null;
    }>(`/api/me/bookings${params}`, { staleTimeMs: 15_000 });

    const pageData = response.data?.items || response.data || [];
    const list = Array.isArray(pageData) ? pageData : [];
    bookings.push(...list);
    if (response.data?.has_more !== true && list.length < BOOKINGS_PAGE_SIZE) break;
    if (response.data?.has_more === false) break;
  }

  return bookings;
}

export default function BookingsList({
  status,
  refreshTrigger,
  initialSeed,
}: BookingsListProps) {
  const [bookings, setBookings] = useState<Booking[]>(() => initialSeed ?? []);
  const [isLoading, setIsLoading] = useState(() => initialSeed === undefined);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("scheduled_desc");
  const router = useRouter();
  const skipHydrateFetchOnce = useRef(
    Boolean(
      initialSeed &&
        initialSeed.length < BOOKINGS_PAGE_SIZE &&
        status === "upcoming" &&
        sortMode === "scheduled_desc" &&
        (refreshTrigger ?? 0) === 0,
    ),
  );

  useEffect(() => {
    const loadBookings = async () => {
      try {
        setIsLoading(true);
        setError(null);

        setBookings(await fetchAllBookingsPages(status, sortMode));
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

    if (skipHydrateFetchOnce.current) {
      skipHydrateFetchOnce.current = false;
      setBookings(initialSeed ?? []);
      setIsLoading(false);
      return;
    }

    void loadBookings();
    // initialSeed only used for first hydration; omit from deps to avoid duplicate fetches
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialSeed is stable for the instance lifetime
  }, [status, refreshTrigger, sortMode]);

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
    const empty =
      status === "past"
        ? {
            title: "No past appointments yet",
            description:
              "Completed visits will appear here once you've attended them.",
            cta: "Find providers",
          }
        : status === "cancelled"
          ? {
              title: "No cancelled bookings",
              description: "When you cancel an appointment, it will show in this list.",
              cta: "Find providers",
            }
          : {
              title: "No appointments scheduled...yet!",
              description:
                "Unveil your radiance and step into a world of luxury. It's time to pamper yourself and embrace your true beauty with our expert care.",
              cta: "Start Searching",
            };

    return (
      <div className="text-center py-12 md:py-16 animate-in fade-in duration-300">
        <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 mb-6">
          <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-[#FF0077]" />
        </div>
        <h3 className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 mb-3">
          {empty.title}
        </h3>
        <p className="text-base md:text-lg font-light text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
          {empty.description}
        </p>
        <Link href="/search" className="inline-block">
          <Button
            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white font-semibold px-8 py-6 text-base shadow-lg hover:shadow-xl transition-all"
          >
            {empty.cta}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 font-light">Sort list by</p>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-full sm:w-[280px] h-11 border-gray-200 bg-white/90">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="scheduled_desc">Appointment time · newest first</SelectItem>
            <SelectItem value="scheduled_asc">Appointment time · soonest first</SelectItem>
            <SelectItem value="created_desc">Date booked · newest first</SelectItem>
            <SelectItem value="created_asc">Date booked · oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {bookings.map((booking) => {
        const _ps = (booking as { payment_status?: string }).payment_status;
        const _outstanding = (booking as { outstanding_balance?: number }).outstanding_balance;
        const lifecycleDisplay = getBookingLifecycleDisplay({
          status: booking.status,
          providerName: (booking as BookingListItem).provider_name,
          // Pass payment context so a stuck `pending_payment` row with paid
          // payment_status displays as "Awaiting provider confirmation" rather
          // than "Payment pending".
          paymentStatus: _ps,
          outstandingBalance: _outstanding,
        });
        const paymentDisplay = getBookingPaymentDisplay({
          paymentStatus: _ps,
          paymentProvider: (booking as { payment_provider?: string }).payment_provider,
          outstandingBalance: _outstanding,
          paymentOption: (booking as { payment_option?: string }).payment_option,
          depositRequired: (booking as { deposit_required?: boolean }).deposit_required,
        });
        const isGroupBooking = Boolean((booking as { is_group_booking?: boolean }).is_group_booking);
        const groupBookingRef = (booking as { group_booking_ref?: string | null }).group_booking_ref;
        // Resolve the effective lifecycle status for badge styling, so the
        // pill colour matches the label (paid pending_payment shows yellow
        // "Awaiting confirmation" not amber "Awaiting payment").
        const _statusForStyle =
          booking.status === "pending_payment" &&
          ((_ps === "paid" || _ps === "partially_paid") ||
            (typeof _outstanding === "number" && _outstanding <= 0.005))
            ? "pending"
            : booking.status;
        return (
        <div
          key={booking.id}
          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-2xl p-6 md:p-8 shadow-lg hover:shadow-2xl hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200"
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                <h3 className="text-lg md:text-xl font-semibold text-gray-900">
                  {(booking as BookingListItem).provider_name || (booking as BookingListItem).services?.[0]?.offering_name || "Beauty Service"}
                </h3>
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-tight ${
                    _statusForStyle === "confirmed"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : _statusForStyle === "completed"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : _statusForStyle === "pending"
                      ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                      : (_statusForStyle as string) === "pending_payment"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : _statusForStyle === "cancelled"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : (_statusForStyle as string) === "started" || _statusForStyle === "in_progress"
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : _statusForStyle === "no_show"
                      ? "bg-gray-100 text-gray-600 border border-gray-200"
                      : "bg-gray-50 text-gray-700 border border-gray-200"
                  }`}
                >
                  {lifecycleDisplay.label}
                </span>
                {(paymentDisplay.isPaymentSettled || paymentDisplay.isDepositPaid) && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-semibold tracking-tight bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {paymentDisplay.label}
                  </span>
                )}
                {isGroupBooking && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-semibold tracking-tight bg-violet-50 text-violet-800 border border-violet-200">
                    Group
                  </span>
                )}
              </div>

              {isGroupBooking && groupBookingRef ? (
                <p className="text-xs text-violet-700 font-medium mb-2">
                  Group session · {groupBookingRef}
                </p>
              ) : null}

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
                <Button
                  variant="outline"
                  className="w-full border-gray-300 hover:border-[#FF0077] hover:text-[#FF0077] transition-colors"
                >
                  View Details
                </Button>
              </Link>
              {booking.status === "confirmed" && (
                <>
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
        </div>
        );
      })}
    </div>
  );
}
