/**
 * Paystack redirect target for normal booking payments.
 * Deep-link URL: `ExpoLinking.createURL("book/paystack")`.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";
import { useTranslation } from "@beautonomi/i18n";
import { useMemo } from "react";

function resolveBookingTarget(verifyData: unknown): RouteTarget | null {
  let cur: unknown = verifyData;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const bookingId =
      (typeof o.bookingId === "string" && o.bookingId.trim()) ||
      (typeof o.booking_id === "string" && o.booking_id.trim());
    if (bookingId) {
      return { pathname: "/(app)/booking-detail", params: { id: bookingId } };
    }
    cur = o.data;
  }
  return null;
}

const FALLBACK: RouteTarget = { pathname: "/(app)/(tabs)/bookings" };

export default function BookPaystackReturnScreen() {
  const { t } = useTranslation();
  const pr = (key: string) =>
    t(`customer.mobile.components.paystackReturn.${key}`) as string;
  const labels = useMemo(
    () => ({
      verifying: pr("bookVerifying"),
      returning: pr("bookReturning"),
      fallbackCta: pr("bookFallbackCta"),
      continueCta: pr("bookContinueCta"),
    }),
    [t],
  );

  return (
    <PaystackReturnScreen
      resolveTarget={resolveBookingTarget}
      cancelledRoute={FALLBACK}
      fallbackRoute={FALLBACK}
      labels={labels}
    />
  );
}
