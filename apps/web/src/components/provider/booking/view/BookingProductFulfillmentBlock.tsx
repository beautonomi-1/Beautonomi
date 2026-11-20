"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { openProductOrderView } from "@/stores/appointment-sidebar-store";
import { useProviderBookingMobileShell } from "../hooks/useProviderBookingMobileShell";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";
import { isCollectionFulfillment, isDeliveryFulfillment, isTerminalProductOrderStatus } from "@beautonomi/utils";
import { toast } from "sonner";
import { formatApiErrorMessage } from "@/lib/http/api-error";

interface BookingProductFulfillmentBlockProps {
  bookingId: string;
}

export function BookingProductFulfillmentBlock({ bookingId }: BookingProductFulfillmentBlockProps) {
  const { t } = useTranslation();
  const mobileShell = useProviderBookingMobileShell();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetcher.get<{
        data?: { orders?: Array<{ id: string; status?: string; fulfillment_type?: string | null }> };
      }>(`/api/provider/product-orders?booking_id=${encodeURIComponent(bookingId)}&limit=1`);
      const row = res?.data?.orders?.[0];
      if (row?.id) {
        setOrderId(row.id);
        setStatus(row.status ?? null);
        setFulfillmentType(row.fulfillment_type ?? null);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (!orderId) return null;

  const p = "web.provider.bookings.detail.productFulfillment";
  const isTerminal = isTerminalProductOrderStatus(status);
  const isCollection = isCollectionFulfillment(fulfillmentType);

  const markCollected = async () => {
    setSaving(true);
    try {
      await fetcher.patch(`/api/provider/product-orders/${orderId}`, { status: "delivered" });
      toast.success(t(`${p}.collected`));
      await load();
    } catch (error) {
      toast.error(formatApiErrorMessage(error, t(`${p}.collectFailed`)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BookingSectionCard className="border-amber-200 bg-amber-50">
      <BookingSectionLabel className="mb-1 flex items-center gap-1.5 text-amber-900">
        <Package className="h-4 w-4" />
        {t(`${p}.title`)}
      </BookingSectionLabel>
      <p className="text-sm text-amber-950">
        {status
          ? t(`${p}.linkedOrderStatus`, { status: status.replace(/_/g, " ") })
          : t(`${p}.linkedOrder`)}
      </p>
      {!isTerminal && isCollection ? (
        <BookingActionButton className="mt-2" size="sm" fullWidth={false} disabled={saving} onClick={() => void markCollected()}>
          {t("web.provider.bookings.detail.products.markCollected")}
        </BookingActionButton>
      ) : null}
      {!isTerminal && isDeliveryFulfillment(fulfillmentType) ? (
        mobileShell ? (
          <BookingActionButton
            className="mt-2"
            size="sm"
            fullWidth={false}
            variant="outline"
            onClick={() => openProductOrderView(orderId)}
          >
            {t(`${p}.fulfillOrder`)}
          </BookingActionButton>
        ) : (
          <a
            href={`/provider/ecommerce/orders?order=${orderId}`}
            className="text-xs font-semibold text-amber-900 underline mt-2 inline-block"
          >
            {t(`${p}.fulfillOrder`)}
          </a>
        )
      ) : null}
      {!isTerminal && !isCollection && !isDeliveryFulfillment(fulfillmentType) ? (
        mobileShell ? (
          <BookingActionButton
            className="mt-2"
            size="sm"
            fullWidth={false}
            variant="outline"
            onClick={() => openProductOrderView(orderId)}
          >
            {t("web.provider.bookings.detail.products.openProductOrders")}
          </BookingActionButton>
        ) : (
          <a
            href={`/provider/ecommerce/orders?order=${orderId}`}
            className="text-xs font-semibold text-amber-900 underline mt-2 inline-block"
          >
            {t("web.provider.bookings.detail.products.openProductOrders")}
          </a>
        )
      ) : null}
    </BookingSectionCard>
  );
}