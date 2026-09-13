"use client";

import { useEffect } from "react";
import { isLikelyFramed, postBookingEmbedMessage } from "@/lib/booking/embed-host";

/**
 * Tells a third-party host when the booking widget is ready and how tall it is.
 * Mount on every public booking surface that can run inside `?embed=1`.
 */
export function BookingEmbedBridge({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active && !isLikelyFramed()) return;
    postBookingEmbedMessage("ready");
    if (typeof ResizeObserver === "undefined" || typeof document === "undefined") return;

    const publishHeight = () => {
      const height = Math.max(
        document.documentElement?.scrollHeight ?? 0,
        document.body?.scrollHeight ?? 0,
      );
      if (height > 0) postBookingEmbedMessage("resize", { height });
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(document.documentElement);
    window.addEventListener("resize", publishHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publishHeight);
    };
  }, [active]);

  return null;
}
