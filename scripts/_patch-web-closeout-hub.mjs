import fs from "node:fs";

const hubPath = "C:/Users/NoloSehloho/Beautonomi/apps/web/src/components/provider/booking/hub/BookingsOverviewTab.tsx";
let hub = fs.readFileSync(hubPath, "utf8");

if (!hub.includes("suggested_close_out_action")) {
  hub = hub.replace(
    `type CloseOutApiBooking = {

  id: string;

  booking_number?: string | null;

  scheduled_at: string;

  status: string;

  customer?: { full_name?: string | null; phone?: string | null } | null;

  booking_services?: Array<{ offering?: { title?: string | null } | null }> | null;

};`,
    `type CloseOutApiBooking = {

  id: string;

  booking_number?: string | null;

  scheduled_at: string;

  status: string;

  total_amount?: number | null;

  payment_status?: string | null;

  balance_due?: number | null;

  suggested_close_out_action?: "complete" | "review" | "provider_cancel" | null;

  suggestedAction?: "complete" | "review" | "provider_cancel" | null;

  customer?: { full_name?: string | null; phone?: string | null } | null;

  booking_services?: Array<{ offering?: { title?: string | null } | null }> | null;

};`,
  );

  hub = hub.replace(
    `function mapCloseOutBooking(row: CloseOutApiBooking): HubScheduleBooking {

  return {

    id: row.id,

    booking_number: row.booking_number,

    status: row.status,

    scheduled_at: row.scheduled_at,

    customer_name: row.customer?.full_name ?? null,

    customer_phone: row.customer?.phone ?? null,

    services: (row.booking_services ?? []).map((bs) => ({

      offering_name: bs.offering?.title ?? undefined,

    })),

  };

}`,
    `function mapCloseOutBooking(row: CloseOutApiBooking): HubScheduleBooking {

  const suggestion = row.suggested_close_out_action ?? row.suggestedAction ?? "review";

  return {

    id: row.id,

    booking_number: row.booking_number,

    status: row.status,

    scheduled_at: row.scheduled_at,

    customer_name: row.customer?.full_name ?? null,

    customer_phone: row.customer?.phone ?? null,

    total_amount: row.total_amount ?? null,

    payment_status: row.payment_status ?? null,

    balance_due: row.balance_due ?? null,

    suggested_close_out_action: suggestion,

    services: (row.booking_services ?? []).map((bs) => ({

      offering_name: bs.offering?.title ?? undefined,

    })),

  };

}`,
  );
}

if (!hub.includes("closeOutActionPending")) {
  hub = hub.replace(
    "  const [closeOutQueue, setCloseOutQueue] = useState<CloseOutResponse | null>(null);",
    `  const [closeOutQueue, setCloseOutQueue] = useState<CloseOutResponse | null>(null);

  const [closeOutActionPending, setCloseOutActionPending] = useState<Set<string>>(() => new Set());`,
  );

  hub = hub.replace(
    "  }, [locationId, bookings.length]);",
    `  }, [locationId, bookings.length]);

  const refreshCloseOutQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (locationId) params.set("location_id", locationId);
      const qs = params.toString();
      const closeOutRes = await fetcher.get<{ data: CloseOutResponse }>(
        \`/api/provider/bookings/close-out\${qs ? \`?\${qs}\` : ""}\`,
      );
      setCloseOutQueue(closeOutRes.data ?? null);
    } catch {
      setCloseOutQueue(null);
    }
  }, [locationId]);`,
  );

  if (!hub.includes("useCallback")) {
    hub = hub.replace(
      'import { useEffect, useMemo, useState } from "react";',
      'import { useCallback, useEffect, useMemo, useState } from "react";',
    );
  } else if (!hub.includes("useCallback,")) {
    hub = hub.replace("useEffect, useMemo, useState", "useCallback, useEffect, useMemo, useState");
  }

  hub = hub.replace(
    "import { fetcher } from \"@/lib/http/fetcher\";",
    `import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatApiErrorMessage } from "@/lib/http/api-error";`,
  );

  const handler = `
  const runCloseOutRowAction = useCallback(
    async (booking: HubScheduleBooking) => {
      const suggestion = booking.suggested_close_out_action ?? "review";
      if (suggestion === "provider_cancel" || suggestion === "review") {
        onOpenBooking(booking);
        return;
      }
      setCloseOutActionPending((prev) => new Set(prev).add(booking.id));
      try {
        const res = await fetcher.post<{
          data?: { results?: Array<{ id: string; ok: boolean; error?: string; code?: string; retry?: boolean }> };
        }>("/api/provider/bookings/close-out/bulk-complete", { booking_ids: [booking.id] });
        const row = res?.data?.results?.find((r) => r.id === booking.id);
        if (!row?.ok) {
          if (row?.code === "BALANCE_DUE") {
            toast.error(t("web.provider.bookingsList.closeOutBalanceDue"));
            onOpenBooking(booking);
            return;
          }
          if (row?.retry) {
            toast.error(t("web.provider.bookingsList.closeOutStartedRetryComplete"));
            return;
          }
          toast.error(row?.error ?? t("web.provider.bookingsList.closeOutCompleteFailed"));
          return;
        }
        toast.success(t("web.provider.bookingsList.closeOutCompleted"));
        await refreshCloseOutQueue();
      } catch (error) {
        toast.error(formatApiErrorMessage(error, t("web.provider.bookingsList.closeOutCompleteFailed")));
      } finally {
        setCloseOutActionPending((prev) => {
          const next = new Set(prev);
          next.delete(booking.id);
          return next;
        });
      }
    },
    [onOpenBooking, refreshCloseOutQueue, t],
  );

  const closeOutPrimaryFor = useCallback(
    (booking: HubScheduleBooking): ProviderBookingAction | null => {
      const suggestion = booking.suggested_close_out_action ?? "review";
      if (suggestion === "complete") {
        return {
          id: "complete_service",
          label: t("web.provider.bookings.scheduleCard.actions.complete_service"),
        };
      }
      return {
        id: "open_booking",
        label: t("web.provider.bookings.scheduleCard.actions.review_booking"),
      };
    },
    [t],
  );
`;

  hub = hub.replace("  const closeOutTotal = closeOutQueue?.summary.total ?? 0;", `${handler}

  const closeOutTotal = closeOutQueue?.summary.total ?? 0;`);

  hub = hub.replace(
    `                pending={pendingActionIds?.has(b.id)}

                primaryAction={getPrimaryAction?.(b) ?? null}

                onOpen={() => onOpenBooking(b)}

                onPrimaryAction={(booking, action) => onPrimaryAction?.(booking, action)}`,
    `                pending={
                  pendingActionIds?.has(b.id) ||
                  (statusFilter === CLOSE_OUT_FILTER && closeOutActionPending.has(b.id))
                }

                primaryAction={
                  statusFilter === CLOSE_OUT_FILTER
                    ? closeOutPrimaryFor(b)
                    : getPrimaryAction?.(b) ?? null
                }

                onOpen={() => onOpenBooking(b)}

                onPrimaryAction={(booking, action) => {
                  if (statusFilter === CLOSE_OUT_FILTER) {
                    void runCloseOutRowAction(booking);
                    return;
                  }
                  onPrimaryAction?.(booking, action);
                }}

                closeOutMode={statusFilter === CLOSE_OUT_FILTER}`,
  );
}

fs.writeFileSync(hubPath, hub);
console.log("patched hub");

const cardPath = "C:/Users/NoloSehloho/Beautonomi/apps/web/src/components/provider/booking/hub/BookingScheduleCard.tsx";
let card = fs.readFileSync(cardPath, "utf8");

if (!card.includes("balance_due")) {
  card = card.replace(
    `  services?: { offering_name?: string; service_name?: string; name?: string }[];
}`,
    `  services?: { offering_name?: string; service_name?: string; name?: string }[];
  balance_due?: number | null;
  suggested_close_out_action?: "complete" | "review" | "provider_cancel" | null;
}`,
  );

  card = card.replace(
    "interface BookingScheduleCardProps {",
    `interface BookingScheduleCardProps {
  closeOutMode?: boolean;`,
  );

  card = card.replace(
    "  onPrimaryAction?: (booking: HubScheduleBooking, action: ProviderBookingAction) => void;\n}",
    `  onPrimaryAction?: (booking: HubScheduleBooking, action: ProviderBookingAction) => void;
  closeOutMode?: boolean;
}`,
  );

  card = card.replace(
    "  onPrimaryAction,\n}: BookingScheduleCardProps)",
    "  onPrimaryAction,\n  closeOutMode = false,\n}: BookingScheduleCardProps)",
  );

  card = card.replace(
    `            {booking.total_amount != null && booking.total_amount > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                <Money amount={booking.total_amount} />
              </p>
            ) : null}`,
    `            {booking.total_amount != null && booking.total_amount > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                <Money amount={booking.total_amount} />
              </p>
            ) : null}
            {closeOutMode && (booking.balance_due ?? 0) > 0 ? (
              <p className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 inline-block mt-1">
                {t("web.provider.bookings.scheduleCard.closeOutDue")}
              </p>
            ) : null}`,
  );
}

fs.writeFileSync(cardPath, card);
console.log("patched card");

const apptPath = "C:/Users/NoloSehloho/Beautonomi/apps/web/src/components/provider/booking/view/AppointmentViewSheet.tsx";
let appt = fs.readFileSync(apptPath, "utf8");
if (!appt.includes("isBookingResourceLocked")) {
  appt = appt.replace(
    'import { subtractMoney, multiplyMoney } from "@beautonomi/utils";',
    'import { isBookingResourceLocked, subtractMoney, multiplyMoney } from "@beautonomi/utils";',
  );
  appt = appt.replace(
    `{canEditAppointments ? (
                  <BookingActionButton
                    size="sm"
                    fullWidth={false}
                    variant="outline"
                    onClick={() => setResourceSheetOpen(true)}
                  >
                    {t(\`\${prefix}.resources\`)}
                  </BookingActionButton>
                ) : null}`,
    `{canEditAppointments && !isBookingResourceLocked(appt.status) ? (
                  <BookingActionButton
                    size="sm"
                    fullWidth={false}
                    variant="outline"
                    onClick={() => setResourceSheetOpen(true)}
                  >
                    {t(\`\${prefix}.resources\`)}
                  </BookingActionButton>
                ) : null}`,
  );
  fs.writeFileSync(apptPath, appt);
  console.log("patched appt");
}

const indexPath = "C:/Users/NoloSehloho/Beautonomi/apps/provider/app/(app)/(tabs)/more/bookings/index.tsx";
let index = fs.readFileSync(indexPath, "utf8");
if (!index.includes("closeOutStartedRetryComplete")) {
  index = index.replace(
    `          setToast({
            message: row?.error ?? res.error ?? bl("closeOutCompleteFailed"),
            type: "error",
          });`,
    `          if (row?.retry) {
            setToast({ message: bl("closeOutStartedRetryComplete"), type: "error" });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return;
          }
          setToast({
            message: row?.error ?? res.error ?? bl("closeOutCompleteFailed"),
            type: "error",
          });`,
  );
  fs.writeFileSync(indexPath, index);
  console.log("patched mobile index");
}