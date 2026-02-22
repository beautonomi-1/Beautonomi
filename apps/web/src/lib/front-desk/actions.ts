/**
 * Front Desk Actions
 * Wraps existing API endpoints - no new backend.
 */

import { fetcher, FetchError } from "@/lib/http/fetcher";
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

/** Record Yoco terminal payment. Uses POST mark-paid with card. */
export async function recordYocoPayment(
  bookingId: string,
  amount: number,
  reference?: string
): Promise<boolean> {
  try {
    await fetcher.post(`/api/provider/bookings/${bookingId}/mark-paid`, {
      payment_method: "card",
      amount,
      reference: reference || `Yoco-${Date.now()}`,
    });
    toast.success("Payment recorded");
    return true;
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : "Failed to record payment";
    toast.error(msg);
    return false;
  }
}
