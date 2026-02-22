"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Redirect to new booking flow, preserving query params
    const params = new URLSearchParams();
    
    // Preserve existing params
    searchParams.forEach((value, key) => {
      params.set(key, value);
    });

    // Redirect to booking page
    const bookingUrl = `/booking${params.toString() ? `?${params.toString()}` : ""}`;
    router.replace(bookingUrl);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingTimeout loadingMessage="Redirecting to booking..." />
    </div>
  );
}