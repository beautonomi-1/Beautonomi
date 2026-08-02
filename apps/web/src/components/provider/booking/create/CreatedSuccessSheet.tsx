"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { providerPortalFetch } from "@/lib/http/fetcher";
import {
  buildProviderBookingCreatedSuccessModel,
  buildConfirmedAfterInlineConfirmModel,
  type ProviderBookingCreatedSuccessInput,
} from "@beautonomi/provider-booking";
import { useAppointmentSidebar, openViewMode, openViewModeWithCollect } from "@/stores/appointment-sidebar-store";
import { providerApi } from "@/lib/provider-portal/api";
import { BookingBottomSheet, BookingActionButton, BookingSectionCard } from "../ui";

interface CreatedSuccessSheetProps {
  onViewBooking?: (appointmentId: string) => void;
}

function bannerClass(tone: "amber" | "green" | "neutral") {
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  return "border-gray-200 bg-gray-50 text-gray-900";
}

export function CreatedSuccessSheet({ onViewBooking }: CreatedSuccessSheetProps) {
  const router = useRouter();
  const { mode, successAppointmentId, successPayload, closeSidebar } = useAppointmentSidebar();
  const open = mode === "success" && !!successAppointmentId;
  const [confirming, setConfirming] = useState(false);
  const [confirmedInline, setConfirmedInline] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmedInline(false);
      setConfirming(false);
    }
  }, [open, successAppointmentId]);

  const payload: ProviderBookingCreatedSuccessInput | null = successPayload;

  const model = useMemo(() => {
    if (!payload) return null;
    if (confirmedInline) return buildConfirmedAfterInlineConfirmModel(payload);
    return buildProviderBookingCreatedSuccessModel(payload);
  }, [confirmedInline, payload]);

  const goToDetail = useCallback(
    (collect?: "paycloud" | "yoco" | "paystack") => {
      if (!successAppointmentId) {
        closeSidebar();
        return;
      }
      const params = new URLSearchParams();
      if (collect === "paycloud") params.set("collectPaycloud", "1");
      if (collect === "yoco") params.set("collectYoco", "1");
      if (collect === "paystack") params.set("collectPaystack", "1");
      const qs = params.toString();
      closeSidebar();
      router.push(`/provider/bookings/${successAppointmentId}${qs ? `?${qs}` : ""}`);
    },
    [closeSidebar, router, successAppointmentId],
  );

  const handleConfirm = async () => {
    if (!successAppointmentId || confirming) return;
    setConfirming(true);
    try {
      await providerPortalFetch(`/api/provider/bookings/${successAppointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "booked" }),
      });
      setConfirmedInline(true);
      toast.success("Booking confirmed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm booking");
    } finally {
      setConfirming(false);
    }
  };

  const handleCollectInSheet = useCallback(
    async (collect: "paycloud" | "yoco" | "paystack") => {
      if (!successAppointmentId) return;
      try {
        const full = await providerApi.getAppointment(successAppointmentId);
        openViewModeWithCollect(full, collect);
      } catch {
        goToDetail(collect);
      }
    },
    [goToDetail, successAppointmentId],
  );

  const handleViewInSheet = async () => {
    if (!successAppointmentId) return;
    try {
      const full = await providerApi.getAppointment(successAppointmentId);
      openViewMode(full);
      onViewBooking?.(successAppointmentId);
    } catch {
      goToDetail();
    }
  };

  const footer = (
    <div className="flex flex-col gap-2">
      {model?.showConfirmCta ? (
        <BookingActionButton disabled={confirming} onClick={() => void handleConfirm()}>
          {confirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Confirming…
            </>
          ) : (
            "Confirm booking"
          )}
        </BookingActionButton>
      ) : null}
      {payload?.postCreateCollect === "paycloud" && (payload.cardChargeAmount ?? 0) > 0 ? (
        <BookingActionButton
          onClick={() => void handleCollectInSheet("paycloud")}
          data-testid="post-create-collect-paycloud"
        >
          Collect on terminal
        </BookingActionButton>
      ) : null}
      {payload?.postCreateCollect === "yoco" && (payload.cardChargeAmount ?? 0) > 0 ? (
        <BookingActionButton onClick={() => void handleCollectInSheet("yoco")}>
          Collect with Yoco
        </BookingActionButton>
      ) : null}
      {payload?.postCreateCollect === "paystack" && (payload.cardChargeAmount ?? 0) > 0 ? (
        <BookingActionButton onClick={() => void handleCollectInSheet("paystack")}>
          Collect on Paystack terminal
        </BookingActionButton>
      ) : null}
      {model?.showReviewCta || model?.showViewCta ? (
        <BookingActionButton variant="outline" onClick={() => void handleViewInSheet()}>
          View booking
        </BookingActionButton>
      ) : null}
      <BookingActionButton variant="outline" onClick={closeSidebar}>
        Done
      </BookingActionButton>
    </div>
  );

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSidebar();
      }}
      mode="view"
      title={model?.title ?? "Booking created"}
      footer={footer}
    >
      <BookingSectionCard className="py-4 space-y-4">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
          <p className="text-sm text-gray-600">{model?.subtitle ?? "The appointment was created successfully."}</p>
        </div>

        {model?.bannerTitle ? (
          <div className={`rounded-xl border p-3 text-sm ${bannerClass(model.bannerTone)}`}>
            <p className="font-semibold">{model.bannerTitle}</p>
            {model.bannerBody ? <p className="mt-1 opacity-90">{model.bannerBody}</p> : null}
          </div>
        ) : null}

        {model?.summaryLines?.length ? (
          <ul className="text-sm text-gray-700 space-y-1">
            {model.summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        {payload?.warnings?.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {payload.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        ) : null}
      </BookingSectionCard>
    </BookingBottomSheet>
  );
}
