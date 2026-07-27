import { Share, Alert } from "react-native";
import {
  bookingShareModelFromProviderReceipt,
  formatReceiptShareText,
  orderShareModelFromReceipt,
  saleShareModelFromReceipt,
} from "@beautonomi/utils";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";

function appBase(): string {
  return APP_URL?.replace(/\/$/, "") ?? "";
}

export async function shareProviderBookingReceipt(bookingId: string, bookingNumber?: string | null) {
  const res = await api.get<{ receipt?: Record<string, unknown> }>(
    `/api/provider/bookings/${bookingId}/receipt`,
  );
  const receipt =
    (res.data as { receipt?: Record<string, unknown> } | null)?.receipt ?? res.data;
  if (res.error || !receipt) {
    Alert.alert("Share failed", res.error?.message ?? "Could not load receipt.");
    return;
  }
  const base = appBase();
  const model = bookingShareModelFromProviderReceipt(receipt, {
    deepLink: base ? `${base}/provider/bookings/${bookingId}` : null,
  });
  const message = formatReceiptShareText(model);
  await Share.share({ message, title: `Booking ${bookingNumber ?? bookingId}` });
}

export async function shareProviderOrderReceipt(orderId: string, orderNumber?: string | null) {
  const res = await api.get<{ receipt?: Record<string, unknown> }>(
    `/api/provider/product-orders/${orderId}/receipt`,
  );
  const receipt = (res.data as { receipt?: Record<string, unknown> } | null)?.receipt ?? res.data;
  if (res.error || !receipt) {
    Alert.alert("Share failed", res.error?.message ?? "Could not load receipt.");
    return;
  }
  const base = appBase();
  const model = orderShareModelFromReceipt(receipt, {
    audience: "provider",
    deepLink: base ? `${base}/provider/ecommerce/orders?order=${encodeURIComponent(orderId)}` : null,
  });
  const message = formatReceiptShareText(model);
  await Share.share({ message, title: `Order ${orderNumber ?? orderId}` });
}

export async function shareProviderSaleReceipt(saleId: string, saleNumber?: string | null) {
  const res = await api.get<{ receipt?: Record<string, unknown> }>(
    `/api/provider/sales/${saleId}/receipt`,
  );
  const receipt = (res.data as { receipt?: Record<string, unknown> } | null)?.receipt ?? res.data;
  if (res.error || !receipt) {
    Alert.alert("Share failed", res.error?.message ?? "Could not load receipt.");
    return;
  }
  const model = saleShareModelFromReceipt(receipt);
  const message = formatReceiptShareText(model);
  await Share.share({ message, title: `Sale ${saleNumber ?? saleId}` });
}
