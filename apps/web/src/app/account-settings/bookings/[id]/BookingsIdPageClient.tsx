"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { getSupabaseClient } from "@/lib/supabase/client";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ShareReceiptButton } from "@/components/receipts/ShareReceiptButton";
import {
  Calendar,
  MapPin,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle2,
  HelpCircle,
  Plus,
  Trophy,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import {
  ALLOWED_RUNNING_LATE_MINUTES,
  canCustomerReportRunningLate,
} from "@/lib/bookings/lifecycle-running-late";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar/ics";
import type { Booking } from "@/types/beautonomi";
import { formatBookingDateInTimeZone, formatBookingTimeInTimeZone } from "@/lib/bookings/display-datetime";
import { getBookingLifecycleDisplay, getBookingPaymentDisplay, resolveEffectiveBookingLifecycleStatus, buildWebRebookHref, slaSettingsFromHours } from "@beautonomi/utils";
import { pendingConfirmationSlaDisplay } from "@/lib/bookings/pending-confirmation-sla-copy";
import { BookingReferencePanel } from "@/components/bookings/BookingReferencePanel";
import { useTranslation } from "@beautonomi/i18n";

/** Booking as returned from GET /api/me/bookings/:id (includes expanded provider, location, etc.) */
type BookingDetail = Booking & {
  selected_datetime?: string;
  location?: { id?: string; name?: string; address?: string; working_hours?: Record<string, unknown> | null };
  location_name?: string;
  provider?: { id?: string; business_name?: string; slug?: string; phone?: string; email?: string; timezone?: string | null; confirmation_sla_hours?: number | null; unconfirmed_expire_hours_before_slot?: number | null };
  outstanding_balance?: number;
  cancellation_fee?: number;
  display_time_zone?: string | null;
  lifecycle_hint?: "upcoming" | "late_window" | "awaiting_close_out" | "past" | null;
  pending_confirmation_sla?: { body?: string; overnight?: boolean; lastMinute?: boolean; timeLabel?: string };
  recurring_series_id?: string | null;
  in_late_window?: boolean;
  close_out_at?: string;
  can_report_running_late?: boolean;
  customer_running_late_at?: string | null;
  customer_running_late_minutes?: number | null;
  provider_late_ack_at?: string | null;
  current_stage?: string | null;
};
import { toast } from "sonner";
import OrderDetailsDynamic from "@/app/checkout/components/order-details-dynamic";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import { SafetyPanicButton } from "@/components/safety/SafetyPanicButton";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const COMPLETION_MODAL_STORAGE_KEY = "booking_completion_modal_seen_";

function formatPercent(value?: number | null): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  const display = n <= 1 ? n * 100 : n;
  return Number.isInteger(display) ? String(display) : display.toFixed(1);
}

export default function BookingDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;
  const onDemandConfig = useModuleConfig("on_demand");
  const helpUrl = (onDemandConfig?.ui_copy as Record<string, string> | undefined)?.waiting_help_url?.trim();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isPayingOutstanding, setIsPayingOutstanding] = useState(false);
  const [chargeApproveLoadingId, setChargeApproveLoadingId] = useState<string | null>(null);
  const [runningLateMinutes, setRunningLateMinutes] = useState<number>(15);
  const [isReportingLate, setIsReportingLate] = useState(false);

  const reloadBooking = useCallback(async (opts?: { silent?: boolean }) => {
    if (!bookingId) return;
    try {
      if (!opts?.silent) {
        setIsLoading(true);
        setError(null);
      }
      const response = await fetcher.get<{
        data: BookingDetail;
        error: null;
      }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });
      setBooking(response.data);
    } catch (err) {
      if (!opts?.silent) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? t("web.accountSettings.bookings.requestTimeout")
            : err instanceof FetchError
              ? err.message
              : t("web.accountSettings.bookings.loadFailed");
        setError(errorMessage);
        console.error("Error loading booking:", err);
      }
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (bookingId) {
      void reloadBooking();
    }
  }, [bookingId, reloadBooking]);

  useEffect(() => {
    const refundId =
      searchParams.get("refund_confirm") ?? searchParams.get("refund_dispute");
    if (!bookingId || !refundId) return;

    const action = searchParams.get("refund_dispute") ? "dispute" : "confirm";
    const run = async () => {
      try {
        await fetcher.post(`/api/me/bookings/${bookingId}/refunds/${refundId}/respond`, {
          action,
        });
        toast.success(
          action === "dispute"
            ? t("web.accountSettings.bookings.refundDisputed")
            : t("web.accountSettings.bookings.refundConfirmed"),
        );
      } catch (err) {
        const msg = err instanceof FetchError ? err.message : t("web.accountSettings.bookings.refundUpdateFailed");
        toast.error(msg);
      } finally {
        router.replace(`/account-settings/bookings/${bookingId}`);
      }
    };
    void run();
  }, [bookingId, router, searchParams]);

  /** Realtime + window focus refetch so additional charges appear without manual refresh. */
  useEffect(() => {
    if (!bookingId) return;
    const supabase = getSupabaseClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void reloadBooking({ silent: true });
      }, 400);
    };

    const channel = supabase
      ? supabase
          .channel(`customer-booking-detail-${bookingId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "bookings",
              filter: `id=eq.${bookingId}`,
            },
            scheduleReload,
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "additional_charges",
              filter: `booking_id=eq.${bookingId}`,
            },
            scheduleReload,
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "additional_charges",
              filter: `booking_id=eq.${bookingId}`,
            },
            scheduleReload,
          )
          .subscribe()
      : null;

    const onFocus = () => {
      void reloadBooking({ silent: true });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channel && supabase) void supabase.removeChannel(channel);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [bookingId, reloadBooking]);

  // Show post-completion modal once per booking when opening a completed booking
  useEffect(() => {
    if (!bookingId || !booking || booking.status !== "completed") return;
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(COMPLETION_MODAL_STORAGE_KEY + bookingId);
      if (!seen) setShowCompletionModal(true);
    } catch {
      // ignore storage errors
    }
  }, [bookingId, booking]);

  const dismissCompletionModal = (markSeen: boolean) => {
    if (markSeen && bookingId && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(COMPLETION_MODAL_STORAGE_KEY + bookingId, "1");
      } catch {
        // ignore
      }
    }
    setShowCompletionModal(false);
  };

  const handleCompletionWriteReview = () => {
    dismissCompletionModal(true);
    router.push(`/account-settings/bookings/${bookingId}/review`);
  };

  const handleApproveRejectCharge = async (chargeId: string, approved: boolean) => {
    if (!bookingId) return;
    setChargeApproveLoadingId(chargeId);
    try {
      await fetcher.post(`/api/me/bookings/${bookingId}/approve-payment`, {
        charge_id: chargeId,
        approved,
      });
      toast.success(approved ? t("web.accountSettings.bookings.chargeApproved") : t("web.accountSettings.bookings.chargeRejected"));
      // Refresh booking to reflect new charge status
      const response = await fetcher.get<{ data: BookingDetail }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });
      setBooking(response.data);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.bookings.chargeActionFailed", { action: approved ? t("web.accountSettings.bookings.approveAction") : t("web.accountSettings.bookings.rejectAction") }));
    } finally {
      setChargeApproveLoadingId(null);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;

    let promptMessage = t("customer.mobile.screens.bookingDetail.cancelDefaultConfirm");
    try {
      const preview = await fetcher.get<{
        data: {
          allowed: boolean;
          reason?: string;
          currency?: string;
          expected_cancellation_fee?: number;
          expected_wallet_refund?: number;
          is_late_cancellation?: boolean;
          refund_capped_by_paid_amount?: boolean;
        };
        error: null;
      }>(`/api/me/bookings/${bookingId}/cancel-preview`, { cache: "no-store", staleTimeMs: 0 });
      const p = preview.data;
      if (!p?.allowed) {
        toast.error(p?.reason || t("customer.mobile.screens.bookingDetail.cancellationNotAllowed"));
        return;
      }
      const cur = p.currency || booking.currency;
      const fee = Number(p.expected_cancellation_fee ?? 0);
      const refund = Number(p.expected_wallet_refund ?? 0);
      const capBlock = p.refund_capped_by_paid_amount
        ? `\n\n${t("customer.mobile.screens.bookingDetail.cancelPreviewCapNote")}`
        : "";
      const windowLine = p.is_late_cancellation
        ? t("customer.mobile.screens.bookingDetail.cancelPreviewLate")
        : t("customer.mobile.screens.bookingDetail.cancelPreviewNormal");
      promptMessage = t("customer.mobile.screens.bookingDetail.cancelPreviewMessage", {
        currency: cur,
        fee: fee.toFixed(2),
        refund: refund.toFixed(2),
        capBlock,
        windowLine,
      });
    } catch {
      // Fallback to generic confirmation text
    }

    const confirmed = window.confirm(promptMessage);
    if (!confirmed) return;

    try {
      setIsCancelling(true);
      const response = await fetcher.post<{
        data: { booking: BookingDetail };
        error: null;
      }>(`/api/me/bookings/${bookingId}/cancel`, {
        reason: "Customer request",
        version: booking.version, // Include version for conflict detection
      });

      setBooking(response.data.booking);
      toast.success(t("web.accountSettings.bookings.cancelledSuccess"));
    } catch (err) {
      if (err instanceof FetchError && err.status === 409) {
        toast.error(t("web.accountSettings.bookings.conflictRefresh"));
        // Reload booking to get latest version
        const refreshResponse = await fetcher.get<{
          data: BookingDetail;
          error: null;
        }>(`/api/me/bookings/${bookingId}`, { cache: "no-store", staleTimeMs: 0 });
        setBooking(refreshResponse.data);
      } else {
        const errorMessage =
          err instanceof FetchError ? err.message : t("web.accountSettings.bookings.cancelFailed");
        toast.error(errorMessage);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReportRunningLate = async () => {
    if (!bookingId) return;
    setIsReportingLate(true);
    try {
      await fetcher.post(`/api/me/bookings/${bookingId}/running-late`, {
        delay_minutes: runningLateMinutes,
      });
      toast.success(t("web.accountSettings.bookings.runningLateNotified"));
      await reloadBooking({ silent: true });
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.bookings.runningLateFailed"));
    } finally {
      setIsReportingLate(false);
    }
  };

  const handlePayOutstanding = async () => {
    if (!bookingId) return;
    try {
      setIsPayingOutstanding(true);
      const res = await fetcher.post<{
        data: { authorization_url?: string };
        error: null;
      }>(`/api/me/bookings/${bookingId}/pay-remaining`, {}, { timeoutMs: 120_000 });
      const url = res?.data?.authorization_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error(t("web.accountSettings.bookings.paymentStartFailed"));
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.bookings.paymentStartFailed"));
    } finally {
      setIsPayingOutstanding(false);
    }
  };

  const bookingTz = booking?.display_time_zone ?? undefined;

  const formatDate = (dateString: string) => {
    return formatBookingDateInTimeZone(dateString, bookingTz);
  };

  const formatTime = (dateString: string) => {
    return formatBookingTimeInTimeZone(dateString, bookingTz);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.accountSettings.bookings.loading")} />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title={t("web.accountSettings.bookings.notFoundTitle")}
          description={error || t("web.accountSettings.bookings.notFoundDescription")}
          action={{
            label: t("web.accountSettings.bookings.goBack"),
            onClick: () => router.push("/account-settings/bookings"),
          }}
        />
      </div>
    );
  }

  // Resolve a coherent lifecycle status: a row stuck at `pending_payment` with
  // payment already settled should behave (and look) like `pending` everywhere
  // on this screen — same active state, same cancel/reschedule rules, same
  // badge colour. Uses the shared helper from `@beautonomi/utils` (same rules as
  // `getBookingLifecycleDisplay`).
  const _detailPaymentStatus = booking.payment_status;
  const _detailOutstanding = booking.outstanding_balance;
  const _detailEffectiveStatus = resolveEffectiveBookingLifecycleStatus({
    status: booking.status,
    paymentStatus: _detailPaymentStatus,
    outstandingBalance: _detailOutstanding,
  }) as Booking["status"];

  const canCancel =
    _detailEffectiveStatus === "confirmed" || _detailEffectiveStatus === "pending";
  const canReschedule = _detailEffectiveStatus === "confirmed" || _detailEffectiveStatus === "pending";
  const isActive = ["pending", "confirmed", "started", "in_progress"].includes(_detailEffectiveStatus);
  const isCashBooking =
    (booking as unknown as Record<string, unknown>).payment_provider === "cash";
  const canPayOutstandingOnline =
    !isCashBooking &&
    _detailEffectiveStatus !== "cancelled" &&
    (booking.outstanding_balance ?? 0) > 0 &&
    (booking.payment_status === "pending" || booking.payment_status === "partially_paid");
  const providerName = booking.provider?.business_name ?? t("web.accountSettings.bookings.yourProvider");
  const expiredPendingReason = String(booking.cancellation_reason ?? "");
  const isExpiredPending =
    booking.status === "cancelled" &&
    (expiredPendingReason.includes("not confirmed in time") ||
      expiredPendingReason.includes("did not confirm this request before the appointment time"));
  const lifecycleDisplay = getBookingLifecycleDisplay({
    status: booking.status,
    providerName,
    paymentStatus: _detailPaymentStatus,
    outstandingBalance: _detailOutstanding,
    lifecycleHint: booking.lifecycle_hint,
  });
  const pendingSlaCopy = lifecycleDisplay.isAwaitingProviderConfirmation && !booking.recurring_series_id
    ? booking.pending_confirmation_sla ??
      pendingConfirmationSlaDisplay({
        scheduledAt: booking.scheduled_at ?? booking.selected_datetime,
        createdAt: booking.created_at,
        paymentStatus: booking.payment_status,
        timezone: booking.provider?.timezone ?? booking.display_time_zone,
        workingHours: (booking.location?.working_hours ?? null) as
          | import("@/lib/bookings/lifecycle-deadlines").WorkingHoursJson
          | null,
        settings: slaSettingsFromHours(booking.provider),
      })
    : null;
  const paymentDisplay = getBookingPaymentDisplay({
    paymentStatus: booking.payment_status,
    paymentProvider: (booking as unknown as Record<string, unknown>).payment_provider as string | undefined,
    outstandingBalance: booking.outstanding_balance,
    paymentOption: (booking as unknown as Record<string, unknown>).payment_option as string | undefined,
    depositRequired: (booking as unknown as Record<string, unknown>).deposit_required as boolean | undefined,
  });

  const scheduledAt = booking.selected_datetime ?? booking.scheduled_at;
  const totalDurationMinutes = booking.services?.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) ?? 0;
  const calendarStart = scheduledAt ? new Date(scheduledAt) : null;
  const calendarEnd = calendarStart ? new Date(calendarStart.getTime() + totalDurationMinutes * 60 * 1000) : null;
  const calendarLocation =
    booking.location_type === "at_salon"
      ? booking.location?.name || booking.location?.address || t("web.accountSettings.bookings.salonFallback")
      : booking.address
        ? `${booking.address.line1}, ${booking.address.city}`
        : t("web.accountSettings.bookings.addressTbd");
  const calendarEvent =
    calendarStart && calendarEnd
      ? {
          title: t("web.accountSettings.bookings.calendarTitle", { provider: providerName }),
          description: `${t("web.accountSettings.bookings.calendarBookingNumber", { number: booking.booking_number })}\n${booking.services?.map((svc) => t("web.accountSettings.bookings.calendarServiceLine", { name: svc.offering_name || t("web.accountSettings.bookings.serviceFallback"), minutes: svc.duration_minutes ?? 0 })).join("\n") ?? ""}`,
          location: calendarLocation,
          start: calendarStart,
          end: calendarEnd,
        }
      : null;

  const runningLateGuard = canCustomerReportRunningLate({
    status: booking.status,
    scheduled_at: booking.scheduled_at,
    location_type: booking.location_type,
    current_stage: booking.current_stage,
    customer_running_late_at: booking.customer_running_late_at,
    booking_services: booking.services?.map((s) => ({
      duration_minutes: s.duration_minutes,
      scheduled_end_at: (s as { scheduled_end_at?: string | null }).scheduled_end_at,
    })),
  });
  const canReportRunningLate =
    typeof booking.can_report_running_late === "boolean"
      ? booking.can_report_running_late
      : runningLateGuard.ok;
  const lifecycleHint = booking.lifecycle_hint;
  const showLateWindowStrip =
    lifecycleHint === "late_window" || booking.in_late_window === true;
  const showRunningLateStrip =
    canReportRunningLate ||
    showLateWindowStrip ||
    Boolean(booking.customer_running_late_at);
  const showAwaitingCloseOutStrip = lifecycleHint === "awaiting_close_out";

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <BackButton href="/account-settings/bookings" label={t("web.accountSettings.bookings.backToBookings")} />
      {booking && (
        <Breadcrumb 
          items={[
            { label: t("web.accountSettings.bookings.breadcrumbAccount"), href: "/account-settings" },
            { label: t("web.accountSettings.bookings.breadcrumbBookings"), href: "/account-settings/bookings" },
            { label: booking.booking_number ? t("web.accountSettings.bookings.bookingNumber", { number: booking.booking_number }) : t("web.accountSettings.bookings.bookingTitle") }
          ]} 
        />
      )}

      {showRunningLateStrip ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-950">
                {showLateWindowStrip ? t("web.accountSettings.bookings.lateWindowTitle") : t("web.accountSettings.bookings.onYourWay")}
              </p>
              <p className="text-sm text-amber-900/90 mt-1">
                {t("web.accountSettings.bookings.runningLateHint", { provider: providerName })}
              </p>
              {booking.customer_running_late_at && !booking.provider_late_ack_at ? (
                <p className="text-sm text-amber-900 mt-2">
                  {t("web.accountSettings.bookings.runningLateReported", {
                    minutes: booking.customer_running_late_minutes
                      ? t("web.accountSettings.bookings.runningLateMinutes", { minutes: booking.customer_running_late_minutes })
                      : "",
                  })}
                </p>
              ) : null}
              {booking.provider_late_ack_at ? (
                <p className="text-sm text-green-800 mt-2 font-medium">
                  {t("web.accountSettings.bookings.providerAcked", { provider: providerName })}
                </p>
              ) : null}
              {canReportRunningLate ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={runningLateMinutes}
                    onChange={(e) => setRunningLateMinutes(Number(e.target.value))}
                    className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm min-h-[40px]"
                  >
                    {ALLOWED_RUNNING_LATE_MINUTES.map((mins) => (
                      <option key={mins} value={mins}>
                        {t("web.accountSettings.bookings.minutesLate", { minutes: mins })}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-[40px]"
                    disabled={isReportingLate}
                    onClick={() => void handleReportRunningLate()}
                  >
                    {isReportingLate ? t("web.accountSettings.bookings.sending") : t("web.accountSettings.bookings.imRunningLate")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showAwaitingCloseOutStrip ? (
        <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 shrink-0 text-orange-700 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-950">{t("web.accountSettings.bookings.closeOutTitle")}</p>
              <p className="text-sm text-orange-900/90 mt-1">
                {t("web.accountSettings.bookings.closeOutBody", { provider: providerName })}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isActive && (
        <div
          className={`mb-6 rounded-2xl border p-4 ${
            lifecycleDisplay.isAwaitingProviderConfirmation
              ? "border-yellow-200 bg-yellow-50"
              : "border-green-200 bg-green-50"
          }`}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className={`h-10 w-10 shrink-0 ${
                lifecycleDisplay.isAwaitingProviderConfirmation ? "text-yellow-600" : "text-green-600"
              }`}
            />
            <div>
              <p className="font-semibold text-gray-900">
                {lifecycleDisplay.title} {formatTime(booking.scheduled_at)}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                {lifecycleDisplay.description}
              </p>
              {pendingSlaCopy ? (
                <p className="text-sm text-gray-600 mt-1">{pendingSlaCopy.body}</p>
              ) : null}
              {(paymentDisplay.isPaymentSettled || paymentDisplay.isDepositPaid) && (
                <p className="text-sm text-gray-600 mt-1">{paymentDisplay.label}.</p>
              )}
              {helpUrl && (
                <a
                  href={helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:underline"
                >
                  <HelpCircle className="h-4 w-4" />
                  {t("web.accountSettings.bookings.help")}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-gray-900">
            {booking.booking_number ? t("web.accountSettings.bookings.bookingNumber", { number: booking.booking_number }) : t("web.accountSettings.bookings.bookingTitle")}
          </h1>
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              _detailEffectiveStatus === "confirmed"
                ? "bg-green-100 text-green-800"
                : _detailEffectiveStatus === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : _detailEffectiveStatus === "cancelled"
                ? "bg-red-100 text-red-800"
                : _detailEffectiveStatus === "completed"
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {lifecycleDisplay.label}
          </span>
        </div>
      </div>

      {isExpiredPending && booking.provider?.slug ? (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="font-semibold text-gray-900">{t("web.accountSettings.bookings.requestExpired")}</p>
          <p className="text-sm text-gray-600 mt-1">
            {expiredPendingReason.trim() ||
              t("web.accountSettings.bookings.requestExpiredDefault")}
          </p>
          <Button
            className="mt-3"
            onClick={() =>
              router.push(
                buildWebRebookHref(
                  booking.provider!.slug!,
                  (booking.services ?? []).map((service) => ({
                    offering_id: service.offering_id,
                    staff_id: service.staff_id,
                  })),
                  {
                    locationId: booking.location_id ?? booking.location?.id ?? null,
                    locationType: booking.location_type,
                  },
                ),
              )
            }
          >
            {t("web.accountSettings.bookings.bookAgain")}
          </Button>
        </div>
      ) : null}

      <BookingReferencePanel
        bookingId={bookingId}
        bookingNumber={booking.booking_number}
        status={_detailEffectiveStatus}
        paymentStatus={booking.payment_status}
        outstandingBalance={booking.outstanding_balance}
        audience="customer"
        supportPath="/help/submit-ticket"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
        {/* Booking Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.bookings.bookingDetails")}</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.date")}</p>
                <p className="font-medium">{formatDate(booking.scheduled_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.time")}</p>
                <p className="font-medium">{formatTime(booking.scheduled_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.location")}</p>
                <p className="font-medium">
                  {booking.location_type === "at_salon"
                    ? booking.location?.name || booking.location_name || t("web.accountSettings.bookings.atSalon")
                    : booking.address
                    ? `${booking.address.line1}, ${booking.address.city}`
                    : t("web.accountSettings.bookings.atYourLocation")}
                </p>
              </div>
            </div>
            {booking.services?.[0]?.staff_name && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.professional")}</p>
                  <p className="font-medium">{booking.services[0].staff_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Provider Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.bookings.provider")}</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-lg">
                {booking.provider?.business_name || t("web.accountSettings.bookings.provider")}
              </p>
              {booking.provider?.phone && (
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span>{booking.provider.phone}</span>
                </div>
              )}
              {booking.provider?.email && (
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  <span>{booking.provider.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {calendarEvent && booking.status !== "cancelled" && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-2 text-gray-900">{t("web.accountSettings.bookings.calendarSectionTitle")}</h2>
          <p className="text-sm text-gray-600 mb-4">
            {t("web.accountSettings.bookings.calendarSectionBefore")}
            <span className="font-medium text-gray-800">{t("web.accountSettings.bookings.googleCalendar")}</span>
            {t("web.accountSettings.bookings.calendarSectionMid")}
            <span className="font-medium text-gray-800">{t("web.accountSettings.bookings.outlook")}</span>
            {t("web.accountSettings.bookings.calendarSectionAfter")}
            <span className="font-medium text-gray-800">{t("web.accountSettings.bookings.ics")}</span>
            {t("web.accountSettings.bookings.calendarSectionEnd")}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={getGoogleCalendarUrl(calendarEvent)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4 me-1" />
              {t("web.accountSettings.bookings.googleCalendar")}
            </a>
            <a
              href={getOutlookCalendarUrl(calendarEvent)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Mail className="w-4 h-4 me-1" />
              {t("web.accountSettings.bookings.outlookWeb")}
            </a>
            <a
              href={`/api/me/bookings/${bookingId}/calendar.ics`}
              download
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Calendar className="w-4 h-4 me-1" />
              {t("web.accountSettings.bookings.calendarFileIcs")}
            </a>
          </div>
        </div>
      )}

      {/* Services */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.bookings.services")}</h2>
        <div className="space-y-3">
          {booking.services?.map((service, index) => (
            <div
              key={service.id || index}
              className="flex justify-between items-center py-3 border-b last:border-0"
            >
              <div>
                <p className="font-medium">{service.offering_name || t("web.accountSettings.bookings.serviceFallback")}</p>
                <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.durationMins", { minutes: service.duration_minutes })}</p>
              </div>
              <p className="font-medium">
                {booking.currency} {service.price.toFixed(2)}
              </p>
            </div>
          ))}
          {(!booking.services || booking.services.length === 0) && (
            <p className="text-sm text-gray-500">{t("web.accountSettings.bookings.noServices")}</p>
          )}
        </div>
        {booking.custom_offer && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">{t("web.accountSettings.bookings.customOfferDetails")}</h3>
            {booking.custom_offer.request?.description && (
              <p className="text-sm text-slate-600 mb-1">
                <span className="font-medium text-slate-800">{t("web.accountSettings.bookings.yourRequest")}</span> {booking.custom_offer.request.description}
              </p>
            )}
            {booking.custom_offer.notes && (
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{t("web.accountSettings.bookings.providerNotes")}</span> {booking.custom_offer.notes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Products */}
      {booking.products && booking.products.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.bookings.products")}</h2>
          <div className="space-y-3">
            {booking.products.map((product, index: number) => (
              <div
                key={product.id || index}
                className="flex justify-between items-center py-3 border-b last:border-0"
              >
                <div>
                  <p className="font-medium">{product.product_name || t("web.accountSettings.bookings.productFallback")}</p>
                  <p className="text-sm text-gray-600">{t("web.accountSettings.bookings.quantity", { count: product.quantity })}</p>
                </div>
                <p className="font-medium">
                  {booking.currency} {product.total_price.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Charges */}
      {booking.additional_charges && booking.additional_charges.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.bookings.additionalCharges")}</h2>
          <div className="space-y-3">
            {booking.additional_charges.map((charge) => (
              <div
                key={charge.id}
                className={`p-4 border rounded-lg ${
                  charge.status === 'paid'
                    ? 'bg-green-50 border-green-200'
                    : charge.status === 'pending' || charge.status === 'approved'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{charge.description}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {charge.currency} {Number(charge.amount).toFixed(2)}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      charge.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : charge.status === 'pending' || charge.status === 'approved'
                        ? 'bg-yellow-100 text-yellow-800'
                        : charge.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {charge.status}
                  </span>
                </div>
                {charge.status === 'pending' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleApproveRejectCharge(charge.id, true)}
                      disabled={chargeApproveLoadingId === charge.id}
                    >
                      {chargeApproveLoadingId === charge.id ? t("web.accountSettings.bookings.approving") : t("web.accountSettings.bookings.approveCta")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleApproveRejectCharge(charge.id, false)}
                      disabled={chargeApproveLoadingId === charge.id}
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      {t("web.accountSettings.bookings.rejectCta")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/account-settings/bookings/${bookingId}/pay-additional/${charge.id}`)}
                      className="bg-gradient-to-r from-primary to-primary-hover text-white"
                    >
                      {t("web.accountSettings.bookings.payNow")}
                    </Button>
                  </div>
                )}
                {charge.status === 'approved' && (
                  <Button
                    onClick={() => router.push(`/account-settings/bookings/${bookingId}/pay-additional/${charge.id}`)}
                    className="mt-2 w-full sm:w-auto bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white"
                  >
                    {t("web.accountSettings.bookings.payNow")}
                  </Button>
                )}
                {charge.paid_at && (
                  <p className="text-xs text-gray-500 mt-2">
                    {t("web.accountSettings.bookings.paidOn", { date: new Date(charge.paid_at).toLocaleDateString() })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-gray-900">{t("web.accountSettings.bookings.paymentSummary")}</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">{t("web.accountSettings.bookings.subtotal")}</span>
            <span className="font-medium">
              {booking.currency} {(Number(booking.subtotal) || 0).toFixed(2)}
            </span>
          </div>
          {booking.travel_fee > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.accountSettings.bookings.travelFee")}</span>
              <span className="font-medium">
                {booking.currency} {booking.travel_fee.toFixed(2)}
              </span>
            </div>
          )}
          {booking.discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">
                {booking.discount_code ? t("web.accountSettings.bookings.discountWithCode", { code: booking.discount_code }) : t("web.accountSettings.bookings.discount")}
              </span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.promotion_discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.accountSettings.bookings.promotion")}</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.promotion_discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.membership_discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.accountSettings.bookings.membershipDiscount")}</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.membership_discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.loyalty_discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.accountSettings.bookings.loyaltyRedeemed")}</span>
              <span className="font-medium text-green-600">
                -{booking.currency} {booking.loyalty_discount_amount.toFixed(2)}
              </span>
            </div>
          )}
          {/* §Finance-truth 2026-05: wallet/gift are payment instruments, not
              discounts. Migration 582 makes `total_paid` include wallet + gift,
              so rendering them above total here would conflict with the "Paid
              via" breakdown rendered below total. We surface them only in the
              payments section so customers see one consistent reconciliation. */}
          {booking.tax_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{booking.tax_rate > 0 ? t("web.accountSettings.bookings.taxWithRate", { rate: booking.tax_rate }) : t("web.accountSettings.bookings.tax")}</span>
              <span className="font-medium">
                {booking.currency} {booking.tax_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.service_fee_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">
                {formatPercent(booking.service_fee_percentage) ? t("web.accountSettings.bookings.platformFeeWithPct", { pct: formatPercent(booking.service_fee_percentage) }) : t("web.accountSettings.bookings.platformFee")}
              </span>
              <span className="font-medium">
                {booking.currency} {booking.service_fee_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.tip_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.accountSettings.bookings.tip")}</span>
              <span className="font-medium">
                {booking.currency} {booking.tip_amount.toFixed(2)}
              </span>
            </div>
          )}
          {booking.additional_charges && booking.additional_charges.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium text-gray-700 mb-2">{t("web.accountSettings.bookings.additionalCharges")}</p>
              {booking.additional_charges
                .filter((c) => c.status !== 'rejected')
                .map((charge) => (
                  <div key={charge.id} className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{charge.description}</span>
                    <span className={`font-medium ${
                      charge.status === 'paid' ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {charge.currency} {Number(charge.amount).toFixed(2)}
                      {charge.status !== 'paid' && t("web.accountSettings.bookings.pendingSuffix")}
                    </span>
                  </div>
                ))}
            </div>
          )}
          {Number(booking.cancellation_fee ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t("web.accountSettings.bookings.cancellationFee")}</span>
              <span className="font-medium text-amber-700">
                {booking.currency} {Number(booking.cancellation_fee).toFixed(2)}
              </span>
            </div>
          )}
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between">
              <span className="font-semibold">{t("web.accountSettings.bookings.total")}</span>
              <span className="font-semibold text-lg">
                {booking.currency} {booking.total_amount.toFixed(2)}
              </span>
            </div>
          </div>
          {/* §Finance-truth 2026-05: payments breakdown — wallet/gift are
              payment methods, not discounts. We split total_paid into wallet,
              gift, and card/other so customers see exactly how the booking
              was settled, never doubling up with the "applied" deduction lines. */}
          {(() => {
            const walletPaid = Number(booking.wallet_amount || 0);
            const giftPaid = Number(booking.gift_card_amount || 0);
            const totalPaid = Number(booking.total_paid || 0);
            const otherPaid = Math.max(0, totalPaid - walletPaid - giftPaid);
            if (totalPaid <= 0 && walletPaid <= 0 && giftPaid <= 0) return null;
            return (
              <div className="pt-2">
                {walletPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t("web.accountSettings.bookings.paidWallet")}</span>
                    <span className="font-medium text-gray-700">
                      {booking.currency} {walletPaid.toFixed(2)}
                    </span>
                  </div>
                )}
                {giftPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t("web.accountSettings.bookings.paidGiftCard")}</span>
                    <span className="font-medium text-gray-700">
                      {booking.currency} {giftPaid.toFixed(2)}
                    </span>
                  </div>
                )}
                {otherPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t("web.accountSettings.bookings.paidCardOther")}</span>
                    <span className="font-medium text-gray-700">
                      {booking.currency} {otherPaid.toFixed(2)}
                    </span>
                  </div>
                )}
                {totalPaid > 0 && (
                  <div className="flex justify-between text-sm font-semibold border-t mt-1 pt-1">
                    <span className="text-gray-700">{t("web.accountSettings.bookings.totalPaid")}</span>
                    <span className="text-green-600">
                      {booking.currency} {totalPaid.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          {booking.outstanding_balance !== undefined && booking.outstanding_balance > 0 && (
            <div className="pt-2 border-t">
              <div className="flex justify-between">
                <span className="font-semibold text-orange-600">{t("web.accountSettings.bookings.outstandingBalance")}</span>
                <span className="font-semibold text-lg text-orange-600">
                  {booking.currency} {booking.outstanding_balance.toFixed(2)}
                </span>
              </div>
              {isCashBooking ? (
                <p className="text-sm text-gray-600 mt-2">
                  {booking.location_type === "at_home"
                    ? t("web.accountSettings.bookings.payCashOnArrival")
                    : t("web.accountSettings.bookings.payCashAtSalon")}
                </p>
              ) : canPayOutstandingOnline ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                    onClick={handlePayOutstanding}
                    disabled={isPayingOutstanding}
                  >
                    <CreditCard className="w-4 h-4 me-2" aria-hidden />
                    {isPayingOutstanding ? t("web.accountSettings.bookings.processing") : t("web.accountSettings.bookings.payOutstanding")}
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    {t("web.accountSettings.bookings.paystackReturnHint")}
                  </p>
                </div>
              ) : null}
            </div>
          )}
          <div className="flex justify-between text-sm text-gray-600 mt-2 pt-2 border-t">
            <span>{t("web.accountSettings.bookings.paymentMethod")}</span>
            <span className="font-medium capitalize">
              {isCashBooking
                ? t("web.accountSettings.bookings.cash")
                : paymentDisplay.isPaymentSettled
                ? t("web.accountSettings.bookings.online")
                : paymentDisplay.isDepositPaid
                ? t("web.accountSettings.bookings.onlineDepositPaid")
                : t("web.accountSettings.bookings.onlinePending")}
            </span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("web.accountSettings.bookings.paymentStatus")}</span>
            <span
              className={`font-medium ${
                paymentDisplay.tone === "success"
                  ? "text-green-600"
                  : paymentDisplay.tone === "warning"
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {paymentDisplay.label}
            </span>
          </div>
          {booking.loyalty_points_earned > 0 && booking.status === "completed" && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">{t("web.accountSettings.bookings.loyaltyEarned")}</span>
              <span className="font-medium text-primary">{t("web.accountSettings.bookings.loyaltyPts", { points: booking.loyalty_points_earned })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Order Tracking — at-home shows full tracker with OTP/ETA; at-salon shows simplified tracker */}
      {(booking.location_type === "at_home" || booking.location_type === "at_salon") && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6">
          <OrderDetailsDynamic bookingId={bookingId} booking={booking} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4 flex-wrap">
        <SafetyPanicButton bookingId={bookingId} />
        <ShareReceiptButton kind="customer-booking" subjectId={bookingId} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:flex-none" />
        {canReschedule && (
          <Button
            variant="outline"
            onClick={() => router.push(`/account-settings/bookings/${bookingId}/reschedule`)}
            className="flex-1"
          >
            {t("web.accountSettings.bookings.reschedule")}
          </Button>
        )}
        {canCancel && (
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isCancelling}
            className="flex-1"
          >
            {isCancelling ? t("web.accountSettings.bookings.cancelling") : t("web.accountSettings.bookings.cancelBooking")}
          </Button>
        )}
        {booking.status === "completed" && (
          <>
            <Button
              variant="outline"
              onClick={() => router.push(`/account-settings/bookings/${bookingId}/review`)}
              className="flex-1"
            >
              {t("web.accountSettings.bookings.writeReview")}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/account-settings/bookings/${bookingId}/receipt`)}
              className="flex-1"
            >
              {t("web.accountSettings.bookings.viewReceipt")}
            </Button>
          </>
        )}
        {booking.payment_status === "paid" && booking.status !== "completed" && (
          <Button
            variant="outline"
            onClick={() => router.push(`/account-settings/bookings/${bookingId}/receipt`)}
            className="flex-1"
          >
            {t("web.accountSettings.bookings.viewReceipt")}
          </Button>
        )}
      </div>

      {/* Post-completion modal: once per booking when opening a completed booking */}
      <Dialog open={showCompletionModal} onOpenChange={(open) => !open && dismissCompletionModal(true)}>
        <DialogContent className="sm:max-w-md" hideClose={false}>
          <DialogHeader>
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-primary/10 p-4">
                <Trophy className="h-10 w-10 text-primary" aria-hidden />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">{t("web.accountSettings.bookings.completeTitle")}</DialogTitle>
            <DialogDescription className="text-center">
              {t("web.accountSettings.bookings.completeBody")}
              {(booking?.loyalty_points_earned ?? 0) > 0 && (
                <span className="mt-2 block font-medium text-primary">
                  {t("web.accountSettings.bookings.completeLoyalty", { points: booking.loyalty_points_earned })}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-col">
            <Button
              onClick={handleCompletionWriteReview}
              className="w-full"
            >
              {t("web.accountSettings.bookings.writeAReview")}
            </Button>
            <Button
              variant="outline"
              onClick={() => dismissCompletionModal(true)}
              className="w-full"
            >
              {t("web.accountSettings.bookings.maybeLater")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
