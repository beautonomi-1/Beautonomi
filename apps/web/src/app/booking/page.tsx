"use client";

import { Suspense } from "react";
import BookingFlow from "./components/booking-flow";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function BookingPage() {
  return (
    <Suspense fallback={<LoadingTimeout loadingMessage="Loading booking..." />}>
      <BookingFlow />
    </Suspense>
  );
}
