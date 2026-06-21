"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock3, CreditCard, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { providerPortalFetch } from "@/lib/http/fetcher";
import {
  buildConfirmedAfterInlineConfirmModel,
  buildProviderBookingCreatedSuccessModel,
  type ProviderBookingCreatedSuccessInput,
} from "@/lib/provider-booking/provider-booking-created-success";

export type ProviderBookingCreatedDialogPayload = ProviderBookingCreatedSuccessInput & {
  bookingId: string;
};

type Props = {
  open: boolean;
  payload: ProviderBookingCreatedDialogPayload | null;
  onOpenChange: (open: boolean) => void;
};

function bannerClass(tone: "amber" | "green" | "neutral") {
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  return "border-gray-200 bg-gray-50 text-gray-900";
}

export function ProviderBookingCreatedDialog({ open, payload, onOpenChange }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmedInline, setConfirmedInline] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmedInline(false);
      setConfirming(false);
    }
  }, [open, payload?.bookingId]);

  const model = useMemo(() => {
    if (!payload) return null;
    if (confirmedInline) {
      return buildConfirmedAfterInlineConfirmModel(payload);
    }
    return buildProviderBookingCreatedSuccessModel(payload);
  }, [confirmedInline, payload]);

  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange]);

  const goToBookingDetail = useCallback(
    (highlightConfirm?: boolean) => {
      if (!payload?.bookingId) {
        dismiss();
        return;
      }
      const suffix = highlightConfirm ? "?highlightConfirm=1" : "";
      dismiss();
      router.push(`/provider/bookings/${payload.bookingId}${suffix}`);
    },
    [dismiss, payload?.bookingId, router],
  );

  const handleConfirm = useCallback(async () => {
    if (!payload?.bookingId || confirming) return;
    setConfirming(true);
    try {
      const res = await providerPortalFetch(`/api/provider/bookings/${payload.bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "booked" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message || "Could not confirm booking");
      }
      toast.success("Booking confirmed");
      setConfirmedInline(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm booking");
    } finally {
      setConfirming(false);
    }
  }, [confirming, payload?.bookingId]);

  if (!payload || !model) return null;

  const Icon =
    model.bannerTone === "green" ? CheckCircle2 : model.showConfirmCta ? Clock3 : CreditCard;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 text-center sm:text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/10">
            <Icon className="h-8 w-8 text-primary" aria-hidden />
          </div>
          <DialogTitle className="text-xl">{model.title}</DialogTitle>
          <DialogDescription className="text-sm leading-6">{model.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-3">
          {model.bannerTitle ? (
            <div className={cn("rounded-xl border px-4 py-3", bannerClass(model.bannerTone))}>
              <p className="text-xs font-semibold uppercase tracking-wide">{model.bannerTitle}</p>
              <p className="mt-1 text-sm leading-5">{model.bannerBody}</p>
            </div>
          ) : null}

          <div className="rounded-xl bg-gray-50 px-4 py-3">
            {model.summaryLines.map((line) => (
              <p key={line} className="text-sm text-gray-900">
                {line}
              </p>
            ))}
          </div>

          {payload.warnings?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              {payload.warnings.map((warning, index) => (
                <p key={`${index}-${warning}`} className="text-sm leading-5 text-amber-950">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 px-6 pb-6 sm:flex-col sm:space-x-0">
          {model.showConfirmCta ? (
            <Button className="w-full" onClick={() => void handleConfirm()} disabled={confirming}>
              {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm booking
            </Button>
          ) : null}
          {model.showReviewCta ? (
            <Button variant="outline" className="w-full" onClick={() => goToBookingDetail(true)}>
              Review booking
            </Button>
          ) : null}
          {model.showViewCta ? (
            <Button className="w-full" onClick={() => goToBookingDetail(false)}>
              View booking
            </Button>
          ) : null}
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={dismiss}>
            Back to calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
