"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Calendar,
  CheckCircle,
  Edit,
  FileText,
  Loader2,
  Play,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { providerApi } from "@/lib/provider-portal/api";
import type { GroupBooking, GroupBookingParticipant } from "@/lib/provider-portal/types";
import { fetcher } from "@/lib/http/fetcher";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import {
  computeGroupOutstandingBalance,
  normalizeGroupBookingId,
} from "@/lib/provider-booking/group-booking-utils";
import { paycloudTipIncludedInChargeAmount } from "@/lib/payments/paycloud-booking-charge";
import { GroupBookingFinancialsSection } from "./GroupBookingFinancialsSection";
import { PaycloudCollectButton } from "@/components/provider-portal/PaycloudCollectButton";
import { ParticipantRefundSheet } from "../scenario/ParticipantRefundSheet";
import { GroupPaystackTerminalSheet } from "./GroupPaystackTerminalSheet";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
  BookingSummaryRow,
  BookingStatusChip,
} from "../ui";
import { openViewMode } from "@/stores/appointment-sidebar-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "@beautonomi/i18n";

const PayCloudPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/PayCloudPaymentDialog").then((m) => ({
      default: m.PayCloudPaymentDialog,
    })),
  { ssr: false },
);

type RecordPaymentMethod = "cash" | "card" | "bank_transfer" | "other" | "yoco";

interface GroupBookingViewSheetProps {
  open: boolean;
  groupId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: (booking: GroupBooking) => void;
  onRefresh?: () => void;
}

export function GroupBookingViewSheet({
  open,
  groupId,
  onOpenChange,
  onEdit,
  onRefresh,
}: GroupBookingViewSheetProps) {
  const { t } = useTranslation();
  const gv = "web.provider.bookings.groupView";
  const { hasPermission, isOwner } = usePermissions();
  const { format: formatMoney } = useProviderMoneyFormat();
  const paystackEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const canEdit = isOwner || hasPermission("edit_appointments");
  const canCancel = isOwner || hasPermission("cancel_appointments") || canEdit;
  const canProcessPayments = isOwner || hasPermission("process_payments");

  const [booking, setBooking] = useState<GroupBooking | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paycloudOpen, setPaycloudOpen] = useState(false);
  const [paystackOpen, setPaystackOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [recordPaymentConfirm, setRecordPaymentConfirm] = useState<{
    method: RecordPaymentMethod;
  } | null>(null);
  const [participantRefund, setParticipantRefund] = useState<{
    bookingId: string;
    name: string;
    maxAmount?: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const fresh = await providerApi.getGroupBooking(normalizeGroupBookingId(groupId));
      setBooking(fresh);
    } catch {
      toast.error(t(`${gv}.loadFailed`));
      setBooking(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!open || !groupId) return;
    void load();
  }, [open, groupId, load]);

  const participants: GroupBookingParticipant[] = booking?.participants ?? [];
  const outstanding = booking ? computeGroupOutstandingBalance(participants, booking) : 0;
  const isFinal = booking?.status === "cancelled" || booking?.status === "completed";
  const canStart = booking?.status === "booked" || booking?.status === "confirmed";
  const started = booking?.status === "started";
  const hasLinkedBookings = participants.some((p) => p.booking_id);
  const travelFee = Number((booking as { travel_fee?: number } | null)?.travel_fee ?? 0);

  const handleStatus = async (status: string) => {
    if (!booking) return;
    const id = normalizeGroupBookingId(booking.id);
    setBusy(true);
    try {
      if (status === "started") {
        await fetcher.post(`/api/provider/group-bookings/${id}?action=start_service`);
      } else if (status === "completed") {
        await fetcher.post(`/api/provider/group-bookings/${id}?action=complete_service`);
      } else {
        await fetcher.patch(`/api/provider/group-bookings/${id}`, { status });
      }
      toast.success(t(`${gv}.markedAs`, {
        status:
          status === "started"
            ? t(`${gv}.statusStarted`)
            : status === "completed"
              ? t(`${gv}.statusCompleted`)
              : status,
      }));
      await load();
      onRefresh?.();
    } catch {
      toast.error(t(`${gv}.updateFailed`));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckIn = async (participantId: string) => {
    if (!booking) return;
    try {
      await providerApi.checkInGroupParticipant(normalizeGroupBookingId(booking.id), participantId);
      toast.success(t(`${gv}.checkedIn`));
      await load();
    } catch {
      toast.error(t(`${gv}.checkInFailed`));
    }
  };

  const handleCheckOut = async (participantId: string) => {
    if (!booking) return;
    try {
      await providerApi.checkOutGroupParticipant(normalizeGroupBookingId(booking.id), participantId);
      toast.success(t(`${gv}.checkedOut`));
      await load();
    } catch {
      toast.error(t(`${gv}.checkOutFailed`));
    }
  };

  const handleRecordPayment = async (method: RecordPaymentMethod) => {
    if (!booking) return;
    try {
      await fetcher.post(
        `/api/provider/group-bookings/${normalizeGroupBookingId(booking.id)}?action=mark_paid`,
        { payment_method: method },
      );
      toast.success(t(`${gv}.paymentRecorded`));
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(`${gv}.paymentFailed`));
    }
  };

  const handleCancel = async () => {
    if (!booking || !canCancel) return;
    try {
      await providerApi.deleteGroupBooking(normalizeGroupBookingId(booking.id));
      toast.success(t(`${gv}.cancelled`));
      setCancelOpen(false);
      onOpenChange(false);
      onRefresh?.();
    } catch {
      toast.error(t(`${gv}.cancelFailed`));
    }
  };

  const handleReceipt = async () => {
    if (!booking) return;
    try {
      const res = await fetcher.get<{ data?: { url?: string } }>(
        `/api/provider/group-bookings/${normalizeGroupBookingId(booking.id)}/receipt/signed-url`,
      );
      const url = res?.data?.url;
      if (url) window.open(url, "_blank");
      else toast.error(t(`${gv}.receiptUnavailable`));
    } catch {
      toast.error(t(`${gv}.receiptLoadFailed`));
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 truncate">{t(`${gv}.title`)}</h2>
        {booking?.ref_number ? (
          <p className="text-xs text-gray-500 font-mono">{booking.ref_number}</p>
        ) : null}
        {booking?.status ? (
          <div className="mt-1">
            <BookingStatusChip status={booking.status} />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="p-2 -me-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={t(`${gv}.close`)}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <>
      <BookingBottomSheet open={open} onOpenChange={onOpenChange} mode="view" header={header}>
        {loading && !booking ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : booking ? (
          <div className="space-y-4 pb-4" data-testid="group-booking-view-sheet">
            <div className="flex flex-wrap gap-2">
              {canEdit && canStart && !isFinal ? (
                <BookingActionButton size="sm" fullWidth={false} disabled={busy} onClick={() => void handleStatus("started")}>
                  <Play className="me-1 h-4 w-4" />
                  {t(`${gv}.start`)}
                </BookingActionButton>
              ) : null}
              {canEdit && started && !isFinal ? (
                <BookingActionButton size="sm" fullWidth={false} disabled={busy} onClick={() => void handleStatus("completed")}>
                  <CheckCircle className="me-1 h-4 w-4" />
                  {t(`${gv}.complete`)}
                </BookingActionButton>
              ) : null}
              <BookingActionButton size="sm" fullWidth={false} variant="outline" onClick={() => void handleReceipt()}>
                <FileText className="me-1 h-4 w-4" />
                {t(`${gv}.receipt`)}
              </BookingActionButton>
              {canEdit && !isFinal && onEdit ? (
                <BookingActionButton size="sm" fullWidth={false} variant="outline" onClick={() => onEdit(booking)}>
                  <Edit className="me-1 h-4 w-4" />
                  {t(`${gv}.edit`)}
                </BookingActionButton>
              ) : null}
            </div>

            <BookingSectionCard>
              <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {t(`${gv}.session`)}
              </BookingSectionLabel>
              {booking.scheduled_at ? (
                <BookingSummaryRow label={t(`${gv}.when`)} value={new Date(booking.scheduled_at).toLocaleString()} />
              ) : null}
              {booking.service_name ? <BookingSummaryRow label={t(`${gv}.service`)} value={booking.service_name} /> : null}
              {booking.team_member_name ? <BookingSummaryRow label={t(`${gv}.staff`)} value={booking.team_member_name} /> : null}
              {(booking as { location_type?: string }).location_type === "at_home" ? (
                <>
                  <BookingSummaryRow label={t(`${gv}.type`)} value={t(`${gv}.atHome`)} />
                  {travelFee > 0 ? <BookingSummaryRow label={t(`${gv}.travel`)} value={formatMoney(travelFee)} /> : null}
                </>
              ) : null}
              {booking.notes ? (
                <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{booking.notes}</p>
              ) : null}
            </BookingSectionCard>

            {booking ? (
              <GroupBookingFinancialsSection
                booking={booking}
                participants={participants}
                outstanding={outstanding}
                variant="sheet"
              />
            ) : null}

            {canProcessPayments && !isFinal && outstanding > 0 ? (
              <BookingSectionCard>
                <BookingSectionLabel className="mb-2">{t(`${gv}.collectPayment`)}</BookingSectionLabel>
                {!hasLinkedBookings ? (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    {t(`${gv}.linkBookingsFirst`)}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <PaycloudCollectButton
                      amount={outstanding}
                      currency={booking.currency ?? "ZAR"}
                      context="group_booking"
                      onClick={() => setPaycloudOpen(true)}
                      className="w-full justify-center min-h-[44px]"
                      size="default"
                    />
                    {(
                      [
                        ["cash", t(`${gv}.markPaidCash`)],
                        ["card", t(`${gv}.markPaidCard`)],
                        ["yoco", t(`${gv}.yoco`)],
                        ["bank_transfer", t(`${gv}.bankTransfer`)],
                        ["other", t(`${gv}.other`)],
                      ] as const
                    ).map(([method, label]) => (
                      <BookingActionButton
                        key={method}
                        variant="outline"
                        onClick={() => setRecordPaymentConfirm({ method })}
                      >
                        {label}
                      </BookingActionButton>
                    ))}
                    {paystackEnabled ? (
                      <BookingActionButton variant="outline" onClick={() => setPaystackOpen(true)}>
                        {t(`${gv}.paystackTerminal`)}
                      </BookingActionButton>
                    ) : null}
                  </div>
                )}
              </BookingSectionCard>
            ) : null}

            <BookingSectionCard>
              <BookingSectionLabel className="mb-3 flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {t(`${gv}.participants`, { count: participants.length })}
              </BookingSectionLabel>
              {participants.length === 0 ? (
                <p className="text-sm text-gray-500">{t(`${gv}.noParticipants`)}</p>
              ) : (
                <ul className="space-y-3">
                  {participants.map((p) => (
                    <li key={p.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <div>
                          <p className="font-medium">{p.client_name ?? t(`${gv}.guest`)}</p>
                          <p className="text-xs text-gray-500">{p.service_name ?? "—"}</p>
                        </div>
                        {p.price != null ? (
                          <span className="font-semibold">{formatMoney(Number(p.price))}</span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canEdit && !isFinal && !p.checked_in ? (
                          <button type="button" className="text-xs font-semibold underline" onClick={() => void handleCheckIn(p.id)}>
                            {t(`${gv}.checkIn`)}
                          </button>
                        ) : null}
                        {canEdit && !isFinal && p.checked_in && !p.checked_out ? (
                          <button type="button" className="text-xs font-semibold underline" onClick={() => void handleCheckOut(p.id)}>
                            {t(`${gv}.checkOut`)}
                          </button>
                        ) : null}
                        {p.booking_id ? (
                          <>
                            <button
                              type="button"
                              className="text-xs font-semibold underline"
                              onClick={() =>
                                openViewMode({
                                  id: p.booking_id!,
                                  booking_id: p.booking_id!,
                                  client_name: p.client_name ?? t(`${gv}.participant`),
                                  service_name: p.service_name ?? t(`${gv}.serviceFallback`),
                                  status: "booked",
                                  scheduled_date: "",
                                  scheduled_time: "",
                                  price: Number(p.price ?? 0),
                                  created_by: "",
                                  created_date: new Date().toISOString(),
                                } as Parameters<typeof openViewMode>[0])
                              }
                            >
                              {t(`${gv}.openBooking`)}
                            </button>
                            {canProcessPayments ? (
                              <button
                                type="button"
                                className="text-xs font-semibold underline text-amber-800"
                                onClick={() =>
                                  setParticipantRefund({
                                    bookingId: p.booking_id!,
                                    name: p.client_name ?? t(`${gv}.participant`),
                                    maxAmount:
                                      Number((p as { total_paid?: number }).total_paid ?? 0) || undefined,
                                  })
                                }
                              >
                                {t(`${gv}.refund`)}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </BookingSectionCard>

            {canCancel && booking.status !== "cancelled" && !isFinal ? (
              <BookingActionButton variant="outline" onClick={() => setCancelOpen(true)}>
                {t(`${gv}.cancelGroup`)}
              </BookingActionButton>
            ) : null}
          </div>
        ) : null}
      </BookingBottomSheet>

      {booking && paycloudOpen ? (
        <PayCloudPaymentDialog
          open={paycloudOpen}
          onOpenChange={setPaycloudOpen}
          amount={outstanding}
          entityType="group_booking"
          entityId={normalizeGroupBookingId(booking.id)}
          groupBookingId={normalizeGroupBookingId(booking.id)}
          bookingLocationId={booking.location_id ?? null}
          tipIncludedInAmount={paycloudTipIncludedInChargeAmount(
            Number((booking as { tip_amount?: number | null }).tip_amount ?? 0),
          )}
          onSuccess={() => {
            setPaycloudOpen(false);
            void load();
            onRefresh?.();
          }}
        />
      ) : null}

      {booking && paystackOpen ? (
        <GroupPaystackTerminalSheet
          open={paystackOpen}
          onOpenChange={setPaystackOpen}
          groupBookingId={normalizeGroupBookingId(booking.id)}
          expectedAmount={outstanding}
        />
      ) : null}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${gv}.cancelTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`${gv}.cancelDescription`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(`${gv}.keep`)}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCancel()}>{t(`${gv}.cancelBooking`)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recordPaymentConfirm} onOpenChange={(next) => !next && setRecordPaymentConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${gv}.recordPaymentTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {outstanding > 0
                ? t(`${gv}.recordPaymentBodyWithAmount`, {
                    method: ({
                      cash: t(`${gv}.methodCash`),
                      card: t(`${gv}.methodCard`),
                      yoco: t(`${gv}.methodYoco`),
                      bank_transfer: t(`${gv}.methodBankTransfer`),
                      other: t(`${gv}.methodOther`),
                    } as Record<string, string>)[recordPaymentConfirm?.method ?? ""] ??
                      recordPaymentConfirm?.method.replace("_", " "),
                    amount: formatMoney(outstanding),
                  })
                : t(`${gv}.recordPaymentBody`, {
                    method: ({
                      cash: t(`${gv}.methodCash`),
                      card: t(`${gv}.methodCard`),
                      yoco: t(`${gv}.methodYoco`),
                      bank_transfer: t(`${gv}.methodBankTransfer`),
                      other: t(`${gv}.methodOther`),
                    } as Record<string, string>)[recordPaymentConfirm?.method ?? ""] ??
                      recordPaymentConfirm?.method.replace("_", " "),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(`${gv}.cancel`)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recordPaymentConfirm) {
                  void handleRecordPayment(recordPaymentConfirm.method);
                  setRecordPaymentConfirm(null);
                }
              }}
            >
              {t(`${gv}.recordPayment`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {participantRefund ? (
        <ParticipantRefundSheet
          open={Boolean(participantRefund)}
          onOpenChange={(next) => !next && setParticipantRefund(null)}
          bookingId={participantRefund.bookingId}
          participantName={participantRefund.name}
          maxAmount={participantRefund.maxAmount}
          onSuccess={() => {
            setParticipantRefund(null);
            void load();
            onRefresh?.();
          }}
        />
      ) : null}
    </>
  );
}
