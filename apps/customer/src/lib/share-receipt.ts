import { Share, Alert } from "react-native";
import {
  bookingShareModelFromCustomerReceipt,
  formatReceiptShareText,
  orderShareModelFromReceipt,
} from "@beautonomi/utils";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";

function appBase(): string {
  return APP_URL?.replace(/\/$/, "") ?? "";
}

export async function shareCustomerBookingReceipt(bookingId: string, bookingNumber?: string | null) {
  const res = await api.get<{ receipt?: Record<string, unknown> }>(
    `/api/bookings/${bookingId}/receipt`,
  );
  const receipt = (res.data as { receipt?: Record<string, unknown> } | null)?.receipt ?? res.data;
  if (res.error || !receipt) {
    Alert.alert("Share failed", res.error?.message ?? "Could not load receipt.");
    return;
  }
  const base = appBase();
  const model = bookingShareModelFromCustomerReceipt(receipt, {
    deepLink: base ? `${base}/account-settings/bookings/${bookingId}` : null,
  });
  const message = formatReceiptShareText(model);
  await Share.share({ message, title: `Booking ${bookingNumber ?? bookingId}` });
}

export async function shareCustomerOrderReceipt(orderId: string, orderNumber?: string | null) {
  const res = await api.get<{ receipt?: Record<string, unknown> }>(
    `/api/me/orders/${orderId}/receipt`,
  );
  const receipt = (res.data as { receipt?: Record<string, unknown> } | null)?.receipt ?? res.data;
  if (res.error || !receipt) {
    Alert.alert("Share failed", res.error?.message ?? "Could not load receipt.");
    return;
  }
  const base = appBase();
  const model = orderShareModelFromReceipt(receipt, {
    audience: "customer",
    deepLink: base ? `${base}/account-settings/orders/${orderId}` : null,
  });
  const message = formatReceiptShareText(model);
  await Share.share({ message, title: `Order ${orderNumber ?? orderId}` });
}
