"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface RealtimeFlashBannerProps {
  message: string | null;
  onDismiss: () => void;
  className?: string;
}

export function RealtimeFlashBanner({ message, onDismiss, className }: RealtimeFlashBannerProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={cn(
        "mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-900 animate-in slide-in-from-top-2",
        className,
      )}
      role="status"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded-full hover:bg-primary/10 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Hook: flash a message when new bookings arrive via realtime. */
export function useBookingsRealtimeFlash(enabled: boolean) {
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const handler = () => setFlashMessage("New booking received");
    window.addEventListener("provider-booking-realtime", handler);
    return () => window.removeEventListener("provider-booking-realtime", handler);
  }, [enabled]);

  return {
    flashMessage,
    dismissFlash: () => setFlashMessage(null),
  };
}

export function emitBookingRealtimeFlash() {
  window.dispatchEvent(new CustomEvent("provider-booking-realtime"));
}
