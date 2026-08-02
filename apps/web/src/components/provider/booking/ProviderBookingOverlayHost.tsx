"use client";

import dynamic from "next/dynamic";
import { useAppointmentSidebar } from "@/stores/appointment-sidebar-store";

const GroupBookingSheet = dynamic(
  () =>
    import("@/components/provider/booking/group/GroupBookingSheet").then((m) => ({
      default: m.GroupBookingSheet,
    })),
  { ssr: false },
);

const ProductOrderViewSheet = dynamic(
  () =>
    import("@/components/provider/booking/commerce/ProductOrderViewSheet").then((m) => ({
      default: m.ProductOrderViewSheet,
    })),
  { ssr: false },
);

const WalkInSaleSheet = dynamic(
  () =>
    import("@/components/provider/booking/commerce/WalkInSaleSheet").then((m) => ({
      default: m.WalkInSaleSheet,
    })),
  { ssr: false },
);

/**
 * Global overlay host for group / product-order / walk-in sheets when the mobile
 * booking shell is enabled. Appointment create/view/edit remain on pages that
 * mount BookingSheetHost (bookings hub, calendar).
 */
export function ProviderBookingOverlayHost() {
  const {
    groupSheetOpen,
    mode,
    groupSheetMode,
    selectedGroupBookingId,
    selectedGroupBooking,
    closeGroupSheet,
    productOrderSheetOpen,
    selectedProductOrderId,
    closeProductOrderSheet,
    walkInSaleSheetOpen,
    closeWalkInSaleSheet,
  } = useAppointmentSidebar();

  return (
    <>
      <GroupBookingSheet
        open={groupSheetOpen || mode === "group"}
        mode={groupSheetMode}
        groupId={selectedGroupBookingId}
        booking={selectedGroupBooking}
        onOpenChange={(open) => {
          if (!open) closeGroupSheet();
        }}
      />
      <ProductOrderViewSheet
        open={productOrderSheetOpen}
        orderId={selectedProductOrderId}
        onOpenChange={(open) => {
          if (!open) closeProductOrderSheet();
        }}
      />
      <WalkInSaleSheet
        open={walkInSaleSheetOpen}
        onOpenChange={(open) => {
          if (!open) closeWalkInSaleSheet();
        }}
      />
    </>
  );
}
