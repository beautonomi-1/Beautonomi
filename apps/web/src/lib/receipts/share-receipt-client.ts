"use client";

import {
  bookingShareModelFromCustomerReceipt,
  bookingShareModelFromProviderReceipt,
  formatReceiptShareText,
  orderShareModelFromReceipt,
} from "@beautonomi/utils";

function appOrigin(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

async function shareText(title: string, message: string, url?: string | null) {
  const fullText = url ? `${message}\n\nView online: ${url}` : message;
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title,
        text: message,
        url: url ?? undefined,
      });
      return;
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(fullText);
    return "copied" as const;
  }
  return null;
}

export async function shareProviderBookingReceiptWeb(bookingId: string) {
  const res = await fetch(`/api/provider/bookings/${bookingId}/receipt`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Could not load receipt");
  const json = (await res.json()) as { data?: Record<string, unknown> };
  const receipt = json.data;
  if (!receipt) throw new Error("Receipt not found");
  const origin = appOrigin();
  const model = bookingShareModelFromProviderReceipt(receipt, {
    deepLink: `${origin}/provider/bookings/${bookingId}`,
  });
  const message = formatReceiptShareText(model);
  return shareText(`Booking ${String(receipt.invoice_number ?? bookingId)}`, message, model.deepLink ?? undefined);
}

export async function shareCustomerBookingReceiptWeb(bookingId: string) {
  const res = await fetch(`/api/bookings/${bookingId}/receipt`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load receipt");
  const json = (await res.json()) as { receipt?: Record<string, unknown> };
  const receipt = json.receipt;
  if (!receipt) throw new Error("Receipt not found");
  const origin = appOrigin();
  const model = bookingShareModelFromCustomerReceipt(receipt, {
    deepLink: `${origin}/account-settings/bookings/${bookingId}`,
  });
  const message = formatReceiptShareText(model);
  return shareText(`Booking ${String(receipt.booking_number ?? bookingId)}`, message, model.deepLink ?? undefined);
}

export async function shareCustomerOrderReceiptWeb(orderId: string) {
  const res = await fetch(`/api/me/orders/${orderId}/receipt`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load receipt");
  const json = (await res.json()) as { receipt?: Record<string, unknown> };
  const receipt = json.receipt;
  if (!receipt) throw new Error("Receipt not found");
  const origin = appOrigin();
  const model = orderShareModelFromReceipt(receipt, {
    audience: "customer",
    deepLink: `${origin}/account-settings/orders/${orderId}`,
  });
  const message = formatReceiptShareText(model);
  return shareText(`Order ${String(receipt.order_number ?? orderId)}`, message, model.deepLink ?? undefined);
}

export async function shareProviderOrderReceiptWeb(orderId: string) {
  const res = await fetch(`/api/provider/product-orders/${orderId}/receipt`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Could not load receipt");
  const json = (await res.json()) as { receipt?: Record<string, unknown> };
  const receipt = json.receipt;
  if (!receipt) throw new Error("Receipt not found");
  const origin = appOrigin();
  const model = orderShareModelFromReceipt(receipt, {
    audience: "provider",
    deepLink: `${origin}/provider/ecommerce/orders?order=${encodeURIComponent(orderId)}`,
  });
  const message = formatReceiptShareText(model);
  return shareText(`Order ${String(receipt.order_number ?? orderId)}`, message, model.deepLink ?? undefined);
}

export async function shareBookingConfirmationWeb(
  booking: Record<string, unknown> & { id: string; booking_number?: string | null },
) {
  const origin = appOrigin();
  const model = bookingShareModelFromCustomerReceipt(booking, {
    deepLink: `${origin}/account-settings/bookings/${booking.id}`,
  });
  const message = formatReceiptShareText(model);
  return shareText(
    `Booking ${String(booking.booking_number ?? booking.id)}`,
    message,
    model.deepLink ?? undefined,
  );
}
