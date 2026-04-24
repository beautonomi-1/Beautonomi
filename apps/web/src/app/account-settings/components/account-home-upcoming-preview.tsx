"use client";

import dynamic from "next/dynamic";

const UpcomingBookingPreview = dynamic(
  () =>
    import("./upcoming-booking-preview").then((m) => ({
      default: m.UpcomingBookingPreview,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mb-6 h-28 max-w-full rounded-xl border border-gray-100 bg-gray-50/90 animate-pulse" />
    ),
  },
);

export default function AccountHomeUpcomingPreview() {
  return (
    <div className="mb-6">
      <UpcomingBookingPreview />
    </div>
  );
}
