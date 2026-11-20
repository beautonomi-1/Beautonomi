"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Package } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";
import {
  isCollectionFulfillment,
  isDeliveryFulfillment,
  isOpenProductOrderStatus,
  isTerminalProductOrderStatus,
  countOpenAppointmentProductOrders,
} from "@beautonomi/utils";
import { fetcher } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openProductOrderView } from "@/stores/appointment-sidebar-store";
import { useProviderBookingMobileShell } from "./hooks/useProviderBookingMobileShell";

type AppointmentProductOrder = {
  id: string;
  order_number?: string | null;
  status?: string | null;
  fulfillment_type?: string | null;
  payment_status?: string | null;
};

export function BookingDetailProductOrders({
  bookingId,
  hasLineItems,
}: {
  bookingId: string;
  hasLineItems: boolean;
}) {
  const { t } = useTranslation();
  const mobileShell = useProviderBookingMobileShell();
  const [orders, setOrders] = useState<AppointmentProductOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher.get<{ data?: { orders?: AppointmentProductOrder[] } }>(
        `/api/provider/product-orders?booking_id=${encodeURIComponent(bookingId)}&limit=20`,
      );
      setOrders(res?.data?.orders ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (hasLineItems) void load();
  }, [hasLineItems, load]);

  const openCount = countOpenAppointmentProductOrders(orders);
  if (!hasLineItems || (orders.length === 0 && !loading)) return null;

  const p = "web.provider.bookings.detail.products";

  const markCollected = async (orderId: string) => {
    setBusyOrderId(orderId);
    try {
      await fetcher.patch(`/api/provider/product-orders/${orderId}`, { status: "delivered" });
      toast.success(t(`${p}.collected`));
      await load();
    } catch (error) {
      toast.error(formatApiErrorMessage(error, t(`${p}.collectFailed`)));
    } finally {
      setBusyOrderId(null);
    }
  };

  const setFulfillmentType = async (orderId: string, fulfillment_type: "collection" | "pickup" | "delivery") => {
    setBusyOrderId(orderId);
    try {
      await fetcher.patch(`/api/provider/product-orders/${orderId}`, { fulfillment_type });
      toast.success(t(`${p}.fulfillmentTypeSaved`));
      await load();
    } catch (error) {
      toast.error(formatApiErrorMessage(error, t(`${p}.fulfillmentTypeFailed`)));
    } finally {
      setBusyOrderId(null);
    }
  };

  const openManage = (orderId: string) => {
    if (mobileShell) openProductOrderView(orderId);
  };

  return (
    <div className="space-y-3">
      {openCount > 0 ? (
        <MotionFreeBanner count={openCount} bookingId={bookingId} />
      ) : null}
      {orders.map((ord) => {
        const isTerminal = isTerminalProductOrderStatus(ord.status);
        const isCollection = isCollectionFulfillment(ord.fulfillment_type);
        const isDelivery = isDeliveryFulfillment(ord.fulfillment_type);
        const busy = busyOrderId === ord.id;
        const typeLabel = isCollection
          ? t(`${p}.pickupLabel`)
          : isDelivery
            ? t(`${p}.deliveryLabel`)
            : t(`${p}.unknownFulfillmentLabel`);

        return (
          <div key={ord.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <MotionFreeRowTitle icon={<Package className="h-4 w-4 text-amber-900" />} title={typeLabel} />
            <p className="text-xs text-amber-800 mt-1">
              {ord.order_number ? `${ord.order_number} · ` : null}
              {t(`${p}.orderStatus`, { status: (ord.status ?? "confirmed").replace(/_/g, " ") })}
            </p>
            {(ord.payment_status ?? "").toLowerCase() === "paid" ? (
              <p className="text-xs text-emerald-800 mt-1">{t(`${p}.paidOnAppointment`)}</p>
            ) : null}
            {!isTerminal && isOpenProductOrderStatus(ord.status) ? (
              <div className="mt-3 flex flex-col gap-2">
                {isCollection ? (
                  <Button size="sm" disabled={busy} onClick={() => void markCollected(ord.id)}>
                    {t(`${p}.markCollected`)}
                  </Button>
                ) : isDelivery ? (
                  mobileShell ? (
                    <Button size="sm" variant="outline" onClick={() => openManage(ord.id)}>
                      {t(`${p}.manageDelivery`)}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/provider/ecommerce/orders?order=${ord.id}`}>{t(`${p}.manageDelivery`)}</Link>
                    </Button>
                  )
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void setFulfillmentType(ord.id, "collection")}
                    >
                      {t(`${p}.setPickup`)}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void setFulfillmentType(ord.id, "delivery")}
                    >
                      {t(`${p}.setDelivery`)}
                    </Button>
                    {mobileShell ? (
                      <Button size="sm" variant="ghost" onClick={() => openManage(ord.id)}>
                        {t(`${p}.openProductOrders`)}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/provider/ecommerce/orders?order=${ord.id}`}>{t(`${p}.openProductOrders`)}</Link>
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MotionFreeRowTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <p className="text-sm font-semibold text-amber-950 flex items-center gap-1.5">
      {icon}
      {title}
    </p>
  );
}

function MotionFreeBanner({ count, bookingId }: { count: number; bookingId: string }) {
  const { t } = useTranslation();
  const p = "web.provider.bookings.detail.products";
  return (
    <a
      href={`#booking-product-orders-${bookingId}`}
      className="block rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <p className="text-sm font-semibold text-amber-950">{t(`${p}.handoverBannerTitle`, { count })}</p>
      <p className="text-xs text-amber-800 mt-1">{t(`${p}.handoverBannerBody`)}</p>
    </a>
  );
}