"use client";

import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ActionPanel, type CompleteRequestRatingPayload } from "./ActionPanel";
import { ProviderClientRatingDialog } from "@/components/provider-portal/ProviderClientRatingDialog";
import { PostForRewardNudge } from "@/components/provider/PostForRewardNudge";
import type { FrontDeskBooking } from "@/lib/front-desk/types";

interface MobilePanelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: FrontDeskBooking | null;
  onActionComplete: () => void;
}

export function MobilePanelSheet({
  open,
  onOpenChange,
  booking,
  onActionComplete,
}: MobilePanelSheetProps) {
  const [pendingRating, setPendingRating] = useState<CompleteRequestRatingPayload | null>(null);
  const [showPostNudge, setShowPostNudge] = useState(false);

  if (!booking) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col rounded-l-[2.5rem] border-l-0 border-[#0F172A]/[0.06] shadow-[-10px_0_40px_rgba(0,0,0,0.1)] bg-[#FDFDFD]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {booking.customer_name || "Customer"} - {booking.booking_number}
            </SheetTitle>
          </SheetHeader>
          <ActionPanel
            booking={booking}
            onClose={() => onOpenChange(false)}
            onActionComplete={onActionComplete}
            onCompleteRequestRating={(payload) => {
              setPendingRating(payload);
              onOpenChange(false);
            }}
          />
        </SheetContent>
      </Sheet>
      {pendingRating && (
        <ProviderClientRatingDialog
          open={!!pendingRating}
          onOpenChange={(open) => !open && setPendingRating(null)}
          bookingId={pendingRating.bookingId}
          customerName={pendingRating.customerName}
          locationId={pendingRating.locationId ?? null}
          locationName={pendingRating.locationName ?? null}
          requireRating
          onRatingSubmitted={() => {
            setPendingRating(null);
            setShowPostNudge(true);
          }}
        />
      )}
      <PostForRewardNudge open={showPostNudge} onOpenChange={setShowPostNudge} />
    </>
  );
}
