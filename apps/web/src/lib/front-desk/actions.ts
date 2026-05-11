/**
 * Front Desk Actions
 * Wraps existing API endpoints - no new backend.
 */

import { fetcher, FetchError } from "@/lib/http/fetcher";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { toast } from "sonner";

/** Mark provider arrived (at-home only). Uses POST bookings/[id]/arrive. */
export async function arriveAtHome(bookingId: string): Promise<boolean> {
  try {
    await fetcher.post(`/api/provider/bookings/${bookingId}/arrive`, {});
    toast.success("Marked as arrived");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to mark arrived";
    toast.error(msg);
    return false;
  }
}

/** Confirm a booking that is still pending in the DB. Uses PATCH bookings/[id] (provider status → booked / DB → confirmed). */
export async function confirmBooking(bookingId: string, version?: number): Promise<boolean> {
  try {
    await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
      status: "booked",
      version,
    });
    toast.success("Booking confirmed");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to confirm booking";
    toast.error(msg);
    return false;
  }
}

/** Check in (at-salon: client_arrived). Uses PATCH bookings/[id]. */
export async function checkInBooking(bookingId: string, version?: number): Promise<boolean> {
  try {
    await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
      current_stage: "client_arrived",
      version,
    });
    toast.success("Checked in");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to check in";
    toast.error(msg);
    return false;
  }
}

/** Start service. Uses POST bookings/[id]/start-service. */
export async function startService(bookingId: string): Promise<boolean> {
  try {
    await fetcher.post(`/api/provider/bookings/${bookingId}/start-service`, {});
    toast.success("Service started");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to start service";
    toast.error(msg);
    return false;
  }
}

/** Mark ready to pay (complete service first if needed). Uses POST complete-service. */
export async function markReadyToPay(bookingId: string): Promise<boolean> {
  try {
    await fetcher.post(`/api/provider/bookings/${bookingId}/complete-service`, {});
    toast.success("Marked ready to pay");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to mark ready to pay";
    toast.error(msg);
    return false;
  }
}

/** Complete booking (service + payment settled). Uses PATCH or complete-service. */
export async function completeBooking(bookingId: string, version?: number): Promise<boolean> {
  try {
    await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
      status: "completed",
      version,
    });
    toast.success("Booking completed");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to complete booking";
    toast.error(msg);
    return false;
  }
}

/** Cancel booking. Uses PATCH bookings/[id]. */
export async function cancelBooking(
  bookingId: string,
  reason?: string,
  version?: number
): Promise<boolean> {
  try {
    await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
      status: "cancelled",
      cancellation_reason: reason,
      version,
    });
    toast.success("Booking cancelled");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to cancel";
    toast.error(msg);
    return false;
  }
}

/** Send Paystack payment link. Uses POST send-payment-link. */
export async function sendPaystackLink(
  bookingId: string,
  deliveryMethod: "email" | "sms" | "both" = "both"
): Promise<boolean> {
  try {
    await fetcher.post(`/api/provider/bookings/${bookingId}/send-payment-link`, {
      delivery_method: deliveryMethod,
    });
    toast.success("Payment link sent");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to send payment link";
    toast.error(msg);
    return false;
  }
}

/** Record Yoco terminal payment (mark-paid only, no terminal). */
export async function recordYocoPayment(
  bookingId: string,
  amount: number,
  reference?: string
): Promise<boolean> {
  try {
    const stableReference = reference?.trim();
    await fetcher.post(`/api/provider/bookings/${bookingId}/mark-paid`, {
      payment_method: "card",
      amount,
      ...(stableReference
        ? { payment_provider: "yoco", reference: stableReference }
        : { payment_provider: "other", idempotency_key: `manual-card:${bookingId}:${amount.toFixed(2)}` }),
    });
    toast.success("Payment recorded");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to record payment";
    toast.error(msg);
    return false;
  }
}

/**
 * Create a real Yoco terminal payment, then mark booking paid with the Yoco reference.
 * If no devices or terminal API fails, falls back to recordYocoPayment (mark-paid only).
 */
export async function createYocoTerminalPaymentAndMarkPaid(
  bookingId: string,
  amount: number,
  _currency: string = LAST_RESORT_CURRENCY
): Promise<boolean> {
  try {
    const devicesRes = await fetcher.get<{ data?: { id: string; name: string; is_active?: boolean }[] }>(
      "/api/provider/yoco/devices"
    );
    const devices = Array.isArray(devicesRes?.data) ? devicesRes.data : (devicesRes as any)?.data ?? [];
    const activeDevices = devices.filter((d) => d.is_active !== false);
    const device = activeDevices[0];

    if (!device?.id) {
      toast.info("No Yoco device found. Recording as manual card payment.");
      return recordYocoPayment(bookingId, amount);
    }

    const paymentRes = await fetcher.post<{ data?: { yoco_payment_id?: string } }>(
      "/api/provider/yoco/payments",
      {
        device_id: device.id,
        amount,
        currency: _currency,
        appointment_id: bookingId,
      }
    );

    const yocoPaymentId = (paymentRes as any)?.data?.yoco_payment_id;
    if (yocoPaymentId) {
      const ok = await recordYocoPayment(bookingId, amount, yocoPaymentId);
      if (ok) toast.success("Terminal payment recorded");
      return ok;
    }

    toast.info("Recording as manual card payment.");
    return recordYocoPayment(bookingId, amount);
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Terminal payment failed";
    toast.error(msg);
    return false;
  }
}
