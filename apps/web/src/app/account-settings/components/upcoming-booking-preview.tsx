"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import { Calendar, MapPin, ArrowRight } from "lucide-react";

interface BookingPreview {
  id: string;
  booking_number: string;
  scheduled_at: string;
  status: string;
  location_type: string;
  provider_name?: string;
  service_summary?: string;
}

export function UpcomingBookingPreview() {
  const [booking, setBooking] = useState<BookingPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetcher.get<{
          data: { items: BookingPreview[]; total: number };
        }>("/api/me/bookings?status=upcoming&limit=1", { cache: "no-store" });
        const items = response.data?.items || [];
        setBooking(items[0] || null);
      } catch {
        setBooking(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return null;
  if (!booking) return null;

  const date = new Date(booking.scheduled_at);
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/account-settings/bookings/${booking.id}`}
      className="block bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100 rounded-xl p-4 hover:border-pink-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-pink-600 uppercase tracking-wide mb-1">
            Next appointment
          </p>
          <p className="font-semibold text-gray-900 truncate">
            {(booking as any).provider_name || "Beauty Service"}
          </p>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
            <Calendar className="h-4 w-4 text-pink-500 shrink-0" />
            <span>
              {dateStr} at {timeStr}
            </span>
          </div>
          {booking.location_type && (
            <div className="flex items-center gap-2 mt-0.5 text-sm text-gray-500">
              <MapPin className="h-4 w-4 text-pink-500 shrink-0" />
              <span>
                {booking.location_type === "at_salon" ? "At Salon" : "At your location"}
              </span>
            </div>
          )}
        </div>
        <ArrowRight className="h-5 w-5 text-pink-500 shrink-0 mt-1" />
      </div>
    </Link>
  );
}
