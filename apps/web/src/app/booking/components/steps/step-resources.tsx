"use client";

import { useCallback, useEffect, useState } from "react";
import ResourceSelection from "@/components/booking/ResourceSelection";
import { BookingState } from "../booking-flow";
import { coerceSelectedDate } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";

interface StepResourcesProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  providerSlug: string;
  onResourcesReadyChange: (ready: boolean) => void;
  onAutoSkip: () => void;
}

export default function StepResources({
  bookingState,
  updateBookingState,
  providerSlug,
  onResourcesReadyChange,
  onAutoSkip,
}: StepResourcesProps) {
  const { t } = useTranslation();
  const selectedDay = coerceSelectedDate(bookingState.selectedDate);
  const [skipped, setSkipped] = useState(false);
  const [loadedResources, setLoadedResources] = useState<
    Array<{ id: string; is_required: boolean }>
  >([]);

  const totalDuration =
    bookingState.selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0) || 60;

  const evaluateReady = useCallback(
    (resources: Array<{ id: string; is_required: boolean }>, selectedIds: string[]) => {
      const requiredIds = resources.filter((r) => r.is_required).map((r) => r.id);
      if (requiredIds.length === 0) {
        onResourcesReadyChange(true);
        return;
      }
      onResourcesReadyChange(requiredIds.every((id) => selectedIds.includes(id)));
    },
    [onResourcesReadyChange],
  );

  useEffect(() => {
    if (!bookingState.selectedTimeSlot) {
      onResourcesReadyChange(false);
    }
  }, [bookingState.selectedTimeSlot, onResourcesReadyChange]);

  useEffect(() => {
    evaluateReady(loadedResources, bookingState.selectedResourceIds ?? []);
  }, [loadedResources, bookingState.selectedResourceIds, evaluateReady]);

  if (!bookingState.selectedTimeSlot || !selectedDay) {
    return (
      <p className="text-sm text-muted-foreground">{t("web.book.flow.chooseDateTime")}</p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          {t("web.booking.resources.stepTitle")}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{t("web.booking.resources.stepSubtitle")}</p>
      </div>
      <ResourceSelection
        providerId={providerSlug}
        serviceIds={bookingState.selectedServices.map((s) => s.id).filter(Boolean)}
        selectedDate={selectedDay}
        selectedTimeSlot={bookingState.selectedTimeSlot}
        selectedResources={bookingState.selectedResourceIds ?? []}
        durationMinutes={totalDuration}
        onResourceChange={(resourceIds) =>
          updateBookingState({ selectedResourceIds: resourceIds })
        }
        onNoResources={() => {
          if (!skipped) {
            setSkipped(true);
            onAutoSkip();
          }
        }}
        onResourcesLoaded={(resources) => {
          setLoadedResources(
            resources.map((r) => ({ id: r.id, is_required: r.is_required })),
          );
        }}
      />
    </div>
  );
}
