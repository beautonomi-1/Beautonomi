"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";
import { ShareReceiptButton } from "@/components/receipts/ShareReceiptButton";
import { formatBookingDateInTimeZone, formatBookingTimeInTimeZone } from "@/lib/bookings/display-datetime";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Mail,
  DollarSign,
  CheckCircle2,
  XCircle,
  Navigation,
  Star,
  Link2,
  CreditCard,
  Camera,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { Booking, AdditionalCharge } from "@/types/beautonomi";

/** Booking as returned from provider API (includes expanded customer, totals, etc.) */
type ProviderBookingDetail = Booking & {
  total_paid?: number;
  total_refunded?: number;
  customer_name?: string;
  customers?: { full_name?: string; rating_average?: number; review_count?: number };
  customer_phone?: string;
  customer_email?: string;
  travel_fee?: number;
  service_fee_amount?: number;
  tax_amount?: number;
  tax_rate?: number;
  location_name?: string;
  staff_name?: string;
  provider_points_earned?: number;
  arrival_otp_verified?: boolean;
  qr_code_verified?: boolean;
  arrival_otp_pending?: boolean;
  qr_arrival_pending?: boolean;
  display_time_zone?: string | null;
  db_status?: string | null;
};
import { toast } from "sonner";
import Link from "next/link";
import { BookingAuditLog } from "@/components/provider/BookingAuditLog";
import { BookingConflictAlert } from "@/components/provider/BookingConflictAlert";
import { SafetyPanicButton } from "@/components/safety/SafetyPanicButton";
import ProviderLocationTracker from "@/components/provider/ProviderLocationTracker";
import { QRCodeDisplay } from "@/components/provider-portal/QRCodeDisplay";
import ResourceAssignmentPanel from "@/components/provider-portal/ResourceAssignmentPanel";
import { ArrivalQrScanDialog } from "@/components/provider/ArrivalQrScanDialog";
import type { QRCodeData } from "@/lib/qr/generator";
import {
  ARRIVAL_PIN_LENGTH_HINT,
  ARRIVAL_PIN_PLACEHOLDER,
  ARRIVAL_PIN_PROVIDER_HEADING,
  ARRIVAL_PIN_PROVIDER_SUBTEXT,
  ARRIVAL_PIN_TOAST_PROVIDER_INCOMPLETE,
  getBookingPaymentDisplay,
  manualCardCollectOptionLabel,
  MANUAL_CARD_METHOD_HELPER,
} from "@beautonomi/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trophy } from "lucide-react";
import CustomerRatingButton from "@/components/reviews/customer-rating-button";
import RateCustomerModal from "@/components/reviews/rate-customer-modal";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { YocoPaymentDialog } from "@/components/provider-portal/YocoPaymentDialog";
import { PayCloudPaymentDialog } from "@/components/provider-portal/PayCloudPaymentDialog";
import { PaycloudCollectButton } from "@/components/provider-portal/PaycloudCollectButton";
import { inferBookingCollectContext, formatPaycloudCollectLabel } from "@/lib/payments/paycloud-collect-cta";
import { computePaycloudBookingChargeAmount } from "@/lib/payments/paycloud-booking-charge";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import { providerApi } from "@/lib/provider-portal/api";
import type { YocoPayment } from "@/lib/provider-portal/types";
import { buildSaleItemsFromBookingDetail } from "@/lib/provider-booking/build-sale-items-from-booking-detail";
import {
  HouseCallExcellenceNote,
  OnPlatformPaymentNote,
} from "@/components/provider/ProviderBookingExcellenceInline";
import {
  buildProviderBookingActionModel,
  type ProviderBookingAction,
} from "@/lib/provider-booking/action-policy";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePermissions } from "@/hooks/usePermissions";

const PROVIDER_COMPLETION_MODAL_STORAGE_KEY = "provider_booking_completion_modal_seen_";

/** Aligned with provider mobile + POST /mark-paid */
const PAYMENT_METHODS_MAIN_BASE = [
  { label: "Cash", value: "cash" as const },
  { label: manualCardCollectOptionLabel(), value: "card" as const, helper: MANUAL_CARD_METHOD_HELPER },
  { label: "EFT", value: "bank_transfer" as const },
  { label: "Other", value: "other" as const },
];

/** Aligned with POST .../additional-charges/[chargeId]/mark-paid */
const PAYMENT_METHODS_CHARGE_BASE = [
  { label: "Cash", value: "cash" as const },
  { label: manualCardCollectOptionLabel(), value: "card" as const, helper: MANUAL_CARD_METHOD_HELPER },
  { label: "Mobile", value: "mobile" as const },
  { label: "EFT", value: "bank_transfer" as const },
  { label: "Other", value: "other" as const },
];

type PaymentMethodMain =
  | (typeof PAYMENT_METHODS_MAIN_BASE)[number]["value"]
  | "paystack_terminal"
  | "paycloud_terminal";
type PaymentMethodCharge =
  | (typeof PAYMENT_METHODS_CHARGE_BASE)[number]["value"]
  | "paycloud_terminal";

const SEND_LINK_OPTIONS = [
  { label: "Email", value: "email" as const },
  { label: "SMS", value: "sms" as const },
  { label: "Email & SMS", value: "both" as const },
];

type SendLinkDelivery = (typeof SEND_LINK_OPTIONS)[number]["value"];

export default function ProviderBookingDetail() {
  const { format: formatMoney } = useProviderMoneyFormat();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const paymentLinkEnabled = useFeatureFlag("payment_link");
  const manualCardEnabled = useFeatureFlag("payment_manual_card");
  const { hasPermission, isOwner } = usePermissions();
  const canEditAppointments = isOwner || hasPermission("edit_appointments");
  const canCancelAppointments =
    isOwner || hasPermission("cancel_appointments") || canEditAppointments;
  const canProcessPayments = isOwner || hasPermission("process_payments");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;
  const {
    ready: paycloudReady,
    loading: paycloudReadinessLoading,
    terminals: paycloudTerminals,
  } = usePaycloudCollectReady();
  const paycloudCollectEnabled =
    paycloudReady || (paycloudTerminals?.inFlight ?? 0) > 0;
  const postCreateCollectHandledRef = useRef(false);

  const [booking, setBooking] = useState<ProviderBookingDetail | null>(null);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [settlementPlan, setSettlementPlan] = useState<{
    recommendedAction: string;
    availableActions: string[];
    cardOnFileRequiresApproval: boolean;
  } | null>(null);
  const [sendingChargeNotify, setSendingChargeNotify] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState<string>("");
  const [isRequestingCharge, setIsRequestingCharge] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [showNoShowDialog, setShowNoShowDialog] = useState(false);
  const [noShowFeeEnabled, setNoShowFeeEnabled] = useState(false);
  const [noShowFeeAmount, setNoShowFeeAmount] = useState(0);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Mark paid state
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<PaymentMethodMain>("cash");
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Send payment link (main booking)
  const [showSendPaymentLink, setShowSendPaymentLink] = useState(false);
  const [sendPaymentLinkMethod, setSendPaymentLinkMethod] = useState<SendLinkDelivery>("email");
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false);

  // Mark additional charge paid
  const [chargeMarkPaidId, setChargeMarkPaidId] = useState<string | null>(null);
  const [chargeMarkPaidMethod, setChargeMarkPaidMethod] = useState<PaymentMethodCharge>("card");
  const [markingChargePaid, setMarkingChargePaid] = useState(false);

  // Refund state
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit">("store_credit");
  const [isRefunding, setIsRefunding] = useState(false);

  // Yoco (parity with provider app: pending sale → terminal → sale PATCH + mark-paid)
  const [showYocoPayment, setShowYocoPayment] = useState(false);
  const [yocoDialogAmount, setYocoDialogAmount] = useState(0);
  const [yocoIntegrationEnabled, setYocoIntegrationEnabled] = useState(false);
  const [preparingYocoSale, setPreparingYocoSale] = useState(false);
  const [yocoBookingSaleId, setYocoBookingSaleId] = useState<string | null>(null);
  const yocoBookingSaleIdRef = useRef<string | null>(null);
  const yocoPendingChargeAmountRef = useRef<number | null>(null);
  const yocoPendingSaleOutstandingSnapshotRef = useRef<number | null>(null);

  const [showPaycloudPayment, setShowPaycloudPayment] = useState(false);
  const [paycloudDialogAmount, setPaycloudDialogAmount] = useState(0);
  const [paycloudEntityType, setPaycloudEntityType] = useState<
    "booking" | "additional_charge"
  >("booking");
  const [paycloudEntityId, setPaycloudEntityId] = useState(bookingId);

  // Paystack Terminal (platform-held in-person QR/link collection)
  const [paystackTerminalReady, setPaystackTerminalReady] = useState(false);
  const [paystackTerminalCode, setPaystackTerminalCode] = useState<string | null>(null);
  const [paystackTerminalReference, setPaystackTerminalReference] = useState<string | null>(null);
  const [paystackTerminalLink, setPaystackTerminalLink] = useState<string | null>(null);
  const [paystackTerminalQr, setPaystackTerminalQr] = useState<string | null>(null);
  const [showPaystackTerminal, setShowPaystackTerminal] = useState(false);
  const [preparingPaystackTerminal, setPreparingPaystackTerminal] = useState(false);

  // Notes state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Provider forms (for labelling form responses)
  const [providerForms, setProviderForms] = useState<Array<{ id: string; title: string; form_type?: string; fields: Array<{ id: string; name: string }> }>>([]);
  const [uploadingConsentFormId, setUploadingConsentFormId] = useState<string | null>(null);

  // At-home journey / arrival
  const [isStartingJourney, setIsStartingJourney] = useState(false);
  const [isMarkingArrived, setIsMarkingArrived] = useState(false);
  const [arrivalPinInput, setArrivalPinInput] = useState("");
  const [isVerifyingArrival, setIsVerifyingArrival] = useState(false);
  const [isResendingArrivalOtp, setIsResendingArrivalOtp] = useState(false);
  const [isOverridingArrival, setIsOverridingArrival] = useState(false);
  // P8 (audit 2026-04): tracks in-flight manual notification sends from
  // the provider detail page (see `handleResendNotification` /
  // `handleSendCancellationNotice`).
  const [isNotifying, setIsNotifying] = useState(false);
  const [backupArrivalQr, setBackupArrivalQr] = useState<QRCodeData | null>(null);
  const [qrArrivalCodeInput, setQrArrivalCodeInput] = useState("");
  const [qrPasteJson, setQrPasteJson] = useState("");
  const [isVerifyingQrArrival, setIsVerifyingQrArrival] = useState(false);
  const [qrScanDialogOpen, setQrScanDialogOpen] = useState(false);

  // Post-completion modal: once per booking when opening a completed booking
  const [showProviderCompletionModal, setShowProviderCompletionModal] = useState(false);
  const [showRateCustomerFromModal, setShowRateCustomerFromModal] = useState(false);

  const loadBooking = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: ProviderBookingDetail }>(
        `/api/provider/bookings/${bookingId}`
      );
      setBooking(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load booking";
      setError(errorMessage);
      console.error("Error loading booking:", err);
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  const loadAdditionalCharges = useCallback(async () => {
    try {
      const response = await fetcher.get<{ data: { charges: AdditionalCharge[]; settlementPlan?: { recommendedAction: string; availableActions: string[]; cardOnFileRequiresApproval: boolean } } }>(
        `/api/provider/bookings/${bookingId}/additional-charges`
      );
      setAdditionalCharges(response.data.charges || []);
      if (response.data.settlementPlan) {
        setSettlementPlan(response.data.settlementPlan);
      }
    } catch (err) {
      console.error("Error loading additional charges:", err);
    }
  }, [bookingId]);

  useEffect(() => {
    loadBooking();
    loadAdditionalCharges();
  }, [loadBooking, loadAdditionalCharges]);

  useEffect(() => {
    yocoBookingSaleIdRef.current = yocoBookingSaleId;
  }, [yocoBookingSaleId]);

  useEffect(() => {
    let cancelled = false;
    providerApi
      .getYocoIntegration()
      .then((i) => {
        if (!cancelled) setYocoIntegrationEnabled(!!i.is_enabled);
      })
      .catch(() => {
        if (!cancelled) setYocoIntegrationEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    let cancelled = false;
    fetcher
      .get<{
        data?: {
          noShowFeeEnabled?: boolean;
          noShowFeeAmount?: number;
          paystackTerminal?: {
            isEnabled?: boolean;
            activeTerminalCount?: number;
            selectable?: boolean;
          };
        };
      }>("/api/provider/settings/payments")
      .then((response) => {
        const terminal = response.data?.paystackTerminal;
        // `selectable` is the single source of truth (accepted + active + usable link);
        // fall back to the legacy shape for older API responses.
        const ready =
          terminal?.selectable ??
          Boolean(terminal?.isEnabled && (terminal.activeTerminalCount ?? 0) > 0);
        if (!cancelled) {
          setPaystackTerminalReady(ready);
          setNoShowFeeEnabled(Boolean(response.data?.noShowFeeEnabled));
          setNoShowFeeAmount(Number(response.data?.noShowFeeAmount ?? 0));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPaystackTerminalReady(false);
          setNoShowFeeEnabled(false);
          setNoShowFeeAmount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    yocoBookingSaleIdRef.current = null;
    setYocoBookingSaleId(null);
    yocoPendingChargeAmountRef.current = null;
    yocoPendingSaleOutstandingSnapshotRef.current = null;
  }, [bookingId]);

  // Show provider post-completion modal once per booking
  useEffect(() => {
    if (!bookingId || typeof bookingId !== "string" || !booking?.id || booking.status !== "completed") return;
    if (typeof window === "undefined") return;
    try {
      const key = PROVIDER_COMPLETION_MODAL_STORAGE_KEY + bookingId;
      const seen = window.localStorage.getItem(key);
      if (!seen) setShowProviderCompletionModal(true);
    } catch {
      // ignore storage errors
    }
  }, [bookingId, booking?.id, booking?.status]);

  useEffect(() => {
    if (booking?.arrival_otp_verified || booking?.qr_code_verified) {
      setBackupArrivalQr(null);
    }
  }, [booking?.arrival_otp_verified, booking?.qr_code_verified]);

  const dismissProviderCompletionModal = (markSeen: boolean) => {
    setShowProviderCompletionModal(false);
    if (markSeen && bookingId && typeof bookingId === "string" && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(PROVIDER_COMPLETION_MODAL_STORAGE_KEY + bookingId, "1");
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    if (!booking?.provider_form_responses || Object.keys(booking.provider_form_responses).length === 0) return;
    fetcher.get<{ data: Array<{ id: string; title: string; form_type?: string; fields?: Array<{ id: string; name: string }> }> }>("/api/provider/forms")
      .then((res) => {
        const list = (res as { data?: Array<{ id: string; title: string; form_type?: string; fields?: Array<{ id: string; name: string }> }> })?.data ?? [];
        setProviderForms(list.map((f) => ({ id: f.id, title: f.title, form_type: f.form_type, fields: f.fields ?? [] })));
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development") console.warn("[Provider booking] Failed to load forms list", err);
      });
  }, [booking?.provider_form_responses]);

  const handleStatusChange = async (newStatus: string) => {
    if (!booking) return;

    try {
      setIsUpdating(true);
      setConflictError(null);

      if (newStatus === "started") {
        const res = await fetcher.post<{ booking: ProviderBookingDetail }>(`/api/provider/bookings/${bookingId}/start-service`, {});
        setBooking({ ...booking, status: "in_progress" as Booking["status"], ...res.booking });
        toast.success("Service started");
        loadBooking();
        return;
      }

      if (newStatus === "completed") {
        const res = await fetcher.post<{ booking: ProviderBookingDetail }>(`/api/provider/bookings/${bookingId}/complete-service`, {});
        setBooking({ ...booking, status: "completed" as Booking["status"], ...res.booking });
        toast.success("Service completed");
        loadBooking();
        setShowProviderCompletionModal(true);
        return;
      }

      if (newStatus === "cancelled") {
        setShowCancelDialog(true);
        return;
      }

      if (newStatus === "no_show") {
        setShowNoShowDialog(true);
        return;
      }

      const response = await fetcher.patch<{ booking: ProviderBookingDetail; conflict?: boolean }>(
        `/api/provider/bookings/${bookingId}`,
        {
          status: newStatus,
          version: booking.version,
        }
      );
      
      if (response.conflict) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
        return;
      }
      
      setBooking({ ...booking, status: newStatus as Booking["status"], ...response.booking });
      toast.success("Booking status updated");
      loadBooking();
    } catch (error) {
      if (error instanceof FetchError && error.status === 409) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        const msg = error instanceof Error ? error.message : "Failed to update booking status";
        toast.error(msg);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmNoShow = async () => {
    if (!booking) return;
    try {
      setIsUpdating(true);
      setConflictError(null);
      const response = await fetcher.patch<{ booking: ProviderBookingDetail; conflict?: boolean }>(
        `/api/provider/bookings/${bookingId}`,
        {
          status: "no_show",
          version: booking.version,
        }
      );
      if (response.conflict) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
        return;
      }
      setBooking({ ...booking, status: "no_show" as Booking["status"], ...response.booking });
      toast.success("Booking marked as no-show");
      setShowNoShowDialog(false);
      loadBooking();
    } catch (error) {
      if (error instanceof FetchError && error.status === 409) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        const msg = error instanceof Error ? error.message : "Failed to mark no-show";
        toast.error(msg);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const noShowPreviewFee = useMemo(() => {
    if (!booking || !noShowFeeEnabled) return 0;
    const collected = Math.max(
      0,
      Math.max(Number(booking.total_paid ?? 0), 0) - Number(booking.total_refunded ?? 0),
    );
    return Math.min(noShowFeeAmount, Number(booking.total_amount ?? 0), collected);
  }, [booking, noShowFeeEnabled, noShowFeeAmount]);

  const handleConfirmCancel = async () => {
    if (!booking) return;
    try {
      setIsUpdating(true);
      setConflictError(null);
      const response = await fetcher.patch<{ booking: ProviderBookingDetail; conflict?: boolean }>(
        `/api/provider/bookings/${bookingId}`,
        {
          status: "cancelled",
          cancellation_reason: cancellationReason || "No reason provided",
          version: booking.version,
        }
      );
      if (response.conflict) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
        return;
      }
      setBooking({ ...booking, status: "cancelled" as Booking["status"], ...response.booking });
      toast.success("Booking cancelled");
      setShowCancelDialog(false);
      setCancellationReason("");
      loadBooking();
    } catch (error) {
      if (error instanceof FetchError && error.status === 409) {
        setConflictError("This booking was modified by another user. Please refresh and try again.");
        toast.error("Conflict detected. Please refresh and try again.");
      } else {
        const msg = error instanceof Error ? error.message : "Failed to cancel booking";
        toast.error(msg);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRequestAdditionalCharge = async () => {
    if (!chargeDescription.trim()) {
      toast.error("Please enter a description");
      return;
    }
    const amountNum = Number(chargeAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      setIsRequestingCharge(true);
      await fetcher.post(`/api/provider/bookings/${bookingId}/request-payment`, {
        description: chargeDescription.trim(),
        amount: amountNum,
      });
      toast.success("Additional charge sent — customer notified");
      setChargeDescription("");
      setChargeAmount("");
      loadAdditionalCharges();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to send additional charge");
    } finally {
      setIsRequestingCharge(false);
    }
  };

  const handleSendChargeToClient = async (chargeId: string) => {
    try {
      setSendingChargeNotify(chargeId);
      await fetcher.post(
        `/api/provider/bookings/${bookingId}/additional-charges/${chargeId}/notify`,
        {}
      );
      toast.success("Payment reminder sent to customer");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to send reminder");
    } finally {
      setSendingChargeNotify(null);
    }
  };

  const handleReschedule = async () => {
    if (!booking) return;
    if (!rescheduleDate || !rescheduleTime) {
      toast.error("Please select both date and time");
      return;
    }
    try {
      setIsRescheduling(true);
      await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
        scheduled_at: `${rescheduleDate}T${rescheduleTime}:00`,
        version: booking.version,
      });
      toast.success("Booking rescheduled");
      setShowReschedule(false);
      loadBooking();
    } catch (err) {
      if (err instanceof FetchError && err.status === 409) {
        setConflictError("This booking was modified. Please refresh and try again.");
      } else {
        toast.error("Failed to reschedule");
      }
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!booking) return;
    if (markPaidMethod === "paycloud_terminal") {
      setShowMarkPaid(false);
      openPaycloudCheckout();
      return;
    }
    const tp = booking.total_paid ?? 0;
    const tr = booking.total_refunded ?? 0;
    const ta = booking.total_amount ?? 0;
    const walletAmt = Number((booking as unknown as Record<string, unknown>).wallet_amount ?? 0);
    const giftCardAmt = Number((booking as unknown as Record<string, unknown>).gift_card_amount ?? 0);
    const outstandingAmt = computeBookingOutstandingDisplay({
      totalAmount: ta, totalPaid: tp, totalRefunded: tr,
      walletAmount: walletAmt, giftCardAmount: giftCardAmt,
      unpaidAdditionalCharges: unpaidChargesTotal, paymentStatus: booking.payment_status,
    });
    const paymentAmount = Number(outstandingAmt.toFixed(2));
    if (paymentAmount <= 0) {
      toast.error(
        outstandingAmt < 0
          ? "This booking has no remaining balance to collect (it may be overpaid). Refresh if you just recorded a payment elsewhere."
          : "There is no remaining balance on this booking."
      );
      return;
    }
    try {
      setIsMarkingPaid(true);
      await fetcher.post(`/api/provider/bookings/${bookingId}/mark-paid`, {
        payment_method: markPaidMethod,
        amount: paymentAmount,
        settle_additional_charges: true,
      });
      toast.success("Booking marked as paid");
      setShowMarkPaid(false);
      await Promise.all([loadBooking(), loadAdditionalCharges()]);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to mark as paid");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleSendPaymentLink = async () => {
    if (!booking) return;
    if (
      (sendPaymentLinkMethod === "email" || sendPaymentLinkMethod === "both") &&
      !booking.customer_email
    ) {
      toast.error("Customer email is required for email delivery");
      return;
    }
    if (
      (sendPaymentLinkMethod === "sms" || sendPaymentLinkMethod === "both") &&
      !booking.customer_phone
    ) {
      toast.error("Customer phone number is required for SMS delivery");
      return;
    }
    try {
      setSendingPaymentLink(true);
      await fetcher.post(`/api/provider/bookings/${bookingId}/send-payment-link`, {
        delivery_method: sendPaymentLinkMethod,
      });
      toast.success(
        sendPaymentLinkMethod === "both"
          ? "Payment link sent via email and SMS"
          : `Payment link sent via ${sendPaymentLinkMethod === "email" ? "email" : "SMS"}`
      );
      setShowSendPaymentLink(false);
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to send payment link");
    } finally {
      setSendingPaymentLink(false);
    }
  };

  const handleChargeMarkPaid = async () => {
    if (!chargeMarkPaidId) return;
    if (chargeMarkPaidMethod === "paycloud_terminal") {
      const c = additionalCharges.find((x) => x.id === chargeMarkPaidId);
      if (!c) return;
      setChargeMarkPaidId(null);
      openPaycloudAdditionalCharge(c.id, Number(c.amount ?? 0));
      return;
    }
    try {
      setMarkingChargePaid(true);
      await fetcher.post(
        `/api/provider/bookings/${bookingId}/additional-charges/${chargeMarkPaidId}/mark-paid`,
        {
          payment_method: chargeMarkPaidMethod,
          notes: `Marked as paid by provider via ${chargeMarkPaidMethod}`,
        }
      );
      toast.success("Charge marked as paid");
      setChargeMarkPaidId(null);
      await Promise.all([loadAdditionalCharges(), loadBooking()]);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to mark as paid");
    } finally {
      setMarkingChargePaid(false);
    }
  };

  const handleRefund = async () => {
    if (!booking) return;
    const tp = booking.total_paid ?? 0;
    const tr = booking.total_refunded ?? 0;
    const maxRefundable = Math.max(0, tp - tr);
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Please enter a valid refund amount");
      return;
    }
    if (amount > maxRefundable + 0.0001) {
      toast.error(`Refund cannot exceed ${formatMoney(maxRefundable)}`);
      return;
    }
    const reason = refundReason.trim();
    if (!reason) {
      toast.error("Please enter a refund reason");
      return;
    }
    try {
      setIsRefunding(true);
      await fetcher.post(`/api/provider/bookings/${bookingId}/refund`, {
        amount,
        reason,
        refund_method: refundMethod,
      });
      toast.success(
        refundMethod === "cash" ? "Refund recorded (returned in person)" : "Refund added to wallet",
      );
      setShowRefund(false);
      setRefundAmount("");
      setRefundReason("");
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to process refund");
    } finally {
      setIsRefunding(false);
    }
  };

  const openYocoCheckout = useCallback(async () => {
    const b = booking;
    if (!b) return;
    const totalPaidLocal = b.total_paid ?? 0;
    const totalRefundedLocal = b.total_refunded ?? 0;
    const totalAmountLocal = b.total_amount ?? 0;
    const walletLocal = Number((b as unknown as Record<string, unknown>).wallet_amount ?? 0);
    const giftLocal = Number((b as unknown as Record<string, unknown>).gift_card_amount ?? 0);
    const outstandingLocal = computeBookingOutstandingDisplay({
      totalAmount: totalAmountLocal, totalPaid: totalPaidLocal, totalRefunded: totalRefundedLocal,
      walletAmount: walletLocal, giftCardAmount: giftLocal,
      unpaidAdditionalCharges: unpaidChargesTotal, paymentStatus: b.payment_status,
    });
    const chargeAmount = Number(outstandingLocal.toFixed(2));
    const isStartedLocal = ["started", "in_progress"].includes(b.status);
    const canMarkPaidLocal = chargeAmount > 0 && (b.status === "completed" || isStartedLocal);

    if (chargeAmount <= 0) {
      toast.error("There is no remaining balance on this booking.");
      return;
    }
    if (!canMarkPaidLocal) {
      toast.error("Start or complete the booking before recording a card payment.");
      return;
    }

    let saleId = yocoBookingSaleIdRef.current ?? yocoBookingSaleId;
    const snap = yocoPendingSaleOutstandingSnapshotRef.current;
    if (
      saleId &&
      snap != null &&
      Number.isFinite(snap) &&
      Math.abs(snap - chargeAmount) > 0.02
    ) {
      yocoBookingSaleIdRef.current = null;
      setYocoBookingSaleId(null);
      yocoPendingSaleOutstandingSnapshotRef.current = null;
      saleId = null;
    }

    if (!saleId) {
      const builtItems = buildSaleItemsFromBookingDetail(b);
      if (builtItems.length === 0) {
        toast.error("Could not build sale lines for this booking.");
        return;
      }
      let items = builtItems;
      let subtotal =
        typeof b.subtotal === "number" && b.subtotal > 0
          ? b.subtotal
          : builtItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      let taxAmount = typeof b.tax_amount === "number" ? b.tax_amount : 0;
      let discountAmount = typeof b.discount_amount === "number" ? b.discount_amount : 0;
      const bookingTotal =
        typeof b.total_amount === "number" ? b.total_amount : subtotal + taxAmount - discountAmount;

      if (Math.abs(chargeAmount - bookingTotal) > 0.01) {
        items = [
          {
            item_id: null,
            product_variant_id: null,
            type: "service",
            name: "Booking balance due",
            quantity: 1,
            unit_price: chargeAmount,
          },
        ];
        subtotal = chargeAmount;
        taxAmount = 0;
        discountAmount = 0;
      }

      const trRaw = typeof b.tax_rate === "number" ? b.tax_rate : 0;
      const taxRate = trRaw > 1 ? trRaw / 100 : trRaw;
      const staffId = b.services?.[0]?.staff_id ?? null;

      setPreparingYocoSale(true);
      try {
        const res = await fetcher.post<{ data: { id: string } }>("/api/provider/sales", {
          customer_id: b.customer_id,
          location_id: b.location_id ?? null,
          staff_id: staffId,
          sale_date: b.scheduled_at,
          items: items.map((i) => ({
            item_id: i.item_id,
            product_variant_id: i.product_variant_id ?? null,
            type: i.type,
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          discount_amount: discountAmount,
          total_amount: chargeAmount,
          payment_method: "yoco",
          payment_status: "pending",
          notes: `Booking ${b.booking_number ?? bookingId}`,
        });
        const newId = res.data?.id;
        if (!newId) {
          toast.error("Could not prepare card payment.");
          return;
        }
        saleId = newId;
        yocoBookingSaleIdRef.current = saleId;
        setYocoBookingSaleId(saleId);
        yocoPendingSaleOutstandingSnapshotRef.current = chargeAmount;
      } catch (err) {
        toast.error(err instanceof FetchError ? err.message : "Could not prepare card payment.");
        return;
      } finally {
        setPreparingYocoSale(false);
      }
    }

    yocoPendingChargeAmountRef.current = chargeAmount;
    setYocoDialogAmount(chargeAmount);
    setShowYocoPayment(true);
  }, [booking, bookingId, yocoBookingSaleId]);

  const openPaycloudCheckout = useCallback(() => {
    const b = booking;
    if (!b) return;
    const unpaidChargesTotal = Array.isArray((b as any).additional_charges)
      ? (b as any).additional_charges
          .filter((c: any) => c?.status !== "paid" && c?.status !== "rejected")
          .reduce((s: number, c: any) => s + Number(c?.amount || 0), 0)
      : Number((b as any).unpaid_additional_charges || 0);
    const outstanding = computeBookingOutstandingDisplay({
      totalAmount: Number(b.total_amount ?? 0),
      totalPaid: Number(b.total_paid ?? 0),
      totalRefunded: Number(b.total_refunded ?? 0),
      walletAmount: Number((b as any).wallet_amount ?? 0),
      giftCardAmount: Number((b as any).gift_card_amount ?? 0),
      unpaidAdditionalCharges: unpaidChargesTotal,
      paymentStatus: b.payment_status,
    });
    const { chargeAmount } = computePaycloudBookingChargeAmount({
      outstanding,
      depositRequired: Boolean((b as { deposit_required?: boolean }).deposit_required),
      depositAmount: Number((b as { deposit_amount?: number }).deposit_amount ?? 0),
      totalPaid: Number(b.total_paid ?? 0),
      unpaidAdditionalCharges: unpaidChargesTotal,
    });
    const rounded = Number(chargeAmount.toFixed(2));
    if (rounded <= 0) {
      toast.error("There is no remaining balance to collect.");
      return;
    }
    setPaycloudEntityType("booking");
    setPaycloudEntityId(bookingId);
    setPaycloudDialogAmount(rounded);
    setShowPaycloudPayment(true);
  }, [booking, bookingId]);

  const openPaycloudAdditionalCharge = useCallback(
    (chargeId: string, chargeAmount: number) => {
      if (chargeAmount <= 0) {
        toast.error("There is no remaining balance to collect.");
        return;
      }
      setPaycloudEntityType("additional_charge");
      setPaycloudEntityId(chargeId);
      setPaycloudDialogAmount(chargeAmount);
      setShowPaycloudPayment(true);
    },
    [],
  );

  useEffect(() => {
    postCreateCollectHandledRef.current = false;
  }, [bookingId]);

  useEffect(() => {
    if (postCreateCollectHandledRef.current) return;
    const b = booking;
    if (!b || isLoading || paycloudReadinessLoading) return;

    const collectPaycloud = searchParams.get("collectPaycloud");
    const collectYoco = searchParams.get("collectYoco");
    if (collectPaycloud !== "1" && collectYoco !== "1") return;

    const lifecycle = String(b.status ?? "");
    const cancelled = lifecycle === "cancelled" || lifecycle === "canceled" || lifecycle === "no_show";
    if (cancelled) return;

    const unpaidCharges = additionalCharges
      .filter((ac) => ac.status !== "paid" && ac.status !== "rejected")
      .reduce((sum, ac) => sum + Number(ac.amount ?? 0), 0);
    const outstandingAmt = computeBookingOutstandingDisplay({
      totalAmount: Number(b.total_amount ?? 0),
      totalPaid: Number(b.total_paid ?? 0),
      totalRefunded: Number(b.total_refunded ?? 0),
      walletAmount: Number((b as unknown as Record<string, unknown>).wallet_amount ?? 0),
      giftCardAmount: Number((b as unknown as Record<string, unknown>).gift_card_amount ?? 0),
      unpaidAdditionalCharges: unpaidCharges,
      paymentStatus: b.payment_status,
    });
    if (outstandingAmt <= 0 || !canProcessPayments) return;

    if (collectPaycloud === "1") {
      if (!paycloudEnabled || !paycloudCollectEnabled) return;
      postCreateCollectHandledRef.current = true;
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("collectPaycloud");
      const qs = nextParams.toString();
      router.replace(
        qs ? `/provider/bookings/${bookingId}?${qs}` : `/provider/bookings/${bookingId}`,
        { scroll: false },
      );
      openPaycloudCheckout();
      return;
    }

    if (
      collectYoco === "1" &&
      yocoEnabled &&
      yocoIntegrationEnabled
    ) {
      postCreateCollectHandledRef.current = true;
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("collectYoco");
      const qs = nextParams.toString();
      router.replace(
        qs ? `/provider/bookings/${bookingId}?${qs}` : `/provider/bookings/${bookingId}`,
        { scroll: false },
      );
      void openYocoCheckout();
    }
  }, [
    additionalCharges,
    booking,
    bookingId,
    canProcessPayments,
    isLoading,
    openPaycloudCheckout,
    openYocoCheckout,
    paycloudCollectEnabled,
    paycloudEnabled,
    paycloudReadinessLoading,
    router,
    searchParams,
    yocoEnabled,
    yocoIntegrationEnabled,
  ]);

  const openPaystackTerminalCollection = useCallback(async () => {
    const b = booking as ProviderBookingDetail | null;
    if (!b) return;
    const totalAmountLocal = Number((b as any).total_amount ?? 0);
    const totalPaidLocal = Number((b as any).total_paid ?? 0);
    const totalRefundedLocal = Number((b as any).total_refunded ?? 0);
    const walletLocal = Number((b as any).wallet_amount ?? 0);
    const giftLocal = Number((b as any).gift_card_amount ?? 0);
    const unpaidChargesTotal = Array.isArray((b as any).additional_charges)
      ? (b as any).additional_charges
          .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
          .reduce((sum: number, charge: any) => sum + Number(charge?.amount || 0), 0)
      : 0;
    const outstandingLocal = computeBookingOutstandingDisplay({
      totalAmount: totalAmountLocal,
      totalPaid: totalPaidLocal,
      totalRefunded: totalRefundedLocal,
      walletAmount: walletLocal,
      giftCardAmount: giftLocal,
      unpaidAdditionalCharges: unpaidChargesTotal,
      paymentStatus: b.payment_status,
    });
    const expectedAmount = Number(outstandingLocal.toFixed(2));
    if (expectedAmount <= 0) {
      toast.error("There is no remaining balance to collect.");
      return;
    }

    try {
      setPreparingPaystackTerminal(true);
      const response = await fetcher.post<{
        data?: {
          terminal?: {
            terminal_code?: string;
            payment_link?: string | null;
            terminal_url?: string | null;
            qr_url?: string | null;
          };
          customerReference?: string | null;
          expectedAmount?: number;
        };
      }>("/api/provider/paystack/terminal-payments", {
        entity_type: "booking",
        entity_id: bookingId,
        expected_amount: expectedAmount,
        customer_reference: (b as any).booking_number ?? bookingId,
      });
      const code = response.data?.terminal?.terminal_code;
      if (!code) {
        toast.error("No Paystack Terminal is ready for this booking.");
        return;
      }
      setPaystackTerminalCode(code);
      setPaystackTerminalReference(
        response.data?.customerReference ?? (b as any).booking_number ?? bookingId,
      );
      setPaystackTerminalLink(
        response.data?.terminal?.payment_link ?? response.data?.terminal?.terminal_url ?? null,
      );
      setPaystackTerminalQr(response.data?.terminal?.qr_url ?? null);
      setShowPaystackTerminal(true);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to prepare Paystack Terminal payment.");
    } finally {
      setPreparingPaystackTerminal(false);
    }
  }, [booking, bookingId]);

  const finalizeYocoBookingPayment = useCallback(
    async (payment: YocoPayment) => {
      const reference = payment.yoco_payment_id;
      if (!reference) {
        toast.error("Missing payment reference");
        return;
      }
      const saleId = yocoBookingSaleIdRef.current ?? yocoBookingSaleId;
      if (!saleId) {
        toast.error("Missing sale record. Try again.");
        return;
      }
      const b = booking;
      if (!b) return;
      const tp = b.total_paid ?? 0;
      const tr = b.total_refunded ?? 0;
      const ta = b.total_amount ?? 0;
      const walletCalc = Number((b as unknown as Record<string, unknown>).wallet_amount ?? 0);
      const giftCalc = Number((b as unknown as Record<string, unknown>).gift_card_amount ?? 0);
      const outstandingCalc = computeBookingOutstandingDisplay({
        totalAmount: ta, totalPaid: tp, totalRefunded: tr,
        walletAmount: walletCalc, giftCardAmount: giftCalc,
        unpaidAdditionalCharges: unpaidChargesTotal, paymentStatus: b.payment_status,
      });

      try {
        await providerApi.updateSale(saleId, {
          payment_status: "completed",
          payment_provider: "yoco",
          payment_provider_id: reference,
        });
      } catch {
        toast.error(
          "The terminal payment succeeded but the sale could not be finalized. Check Sales for a pending entry."
        );
        return;
      }

      const chargeForBooking = yocoPendingChargeAmountRef.current ?? outstandingCalc;
      try {
        // §Yoco-audit 2026-05: pass `payment_provider: "yoco"` so the
        // mark-paid route stores the row with `payment_provider = 'yoco'`
        // and the partial unique index (migration 536) actually enforces
        // idempotency on the Yoco reference. Without this the row landed as
        // `payment_provider = 'other'` and the yoco-reconciliation report
        // could not match the booking_payments row to provider_yoco_payments.
        await fetcher.post(`/api/provider/bookings/${bookingId}/mark-paid`, {
          payment_method: "card",
          payment_provider: "yoco",
          reference,
          amount: Number(chargeForBooking.toFixed(2)),
          settle_additional_charges: true,
        });
      } catch (err) {
        toast.error(
          err instanceof FetchError
            ? `The sale was saved, but updating the booking failed: ${err.message}`
            : "The sale was saved, but updating the booking failed."
        );
        await loadBooking();
        return;
      }

      yocoBookingSaleIdRef.current = null;
      setYocoBookingSaleId(null);
      yocoPendingChargeAmountRef.current = null;
      yocoPendingSaleOutstandingSnapshotRef.current = null;
      setShowYocoPayment(false);
      toast.success("Booking payment recorded");
      await Promise.all([loadBooking(), loadAdditionalCharges()]);
    },
    [booking, bookingId, loadBooking, yocoBookingSaleId]
  );

  const handleSaveNotes = async () => {
    if (!booking) return;
    try {
      setIsSavingNotes(true);
      await fetcher.patch(`/api/provider/bookings/${bookingId}`, {
        special_requests: notesText,
        version: booking.version,
      });
      toast.success("Notes saved");
      setEditingNotes(false);
      loadBooking();
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleStartJourney = async (etaMinutes?: number) => {
    try {
      setIsStartingJourney(true);
      const estimated_arrival = etaMinutes
        ? new Date(Date.now() + etaMinutes * 60 * 1000).toISOString()
        : undefined;
      await fetcher.post(`/api/provider/bookings/${bookingId}/start-journey`, {
        ...(estimated_arrival && { estimated_arrival }),
      });
      toast.success(estimated_arrival ? `Journey started. ETA ${etaMinutes} min.` : "Journey started.");
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to start journey");
    } finally {
      setIsStartingJourney(false);
    }
  };

  const handleMarkArrived = async () => {
    try {
      setIsMarkingArrived(true);
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000,
          });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      }
      const arriveRes = await fetcher.post<{ data: { qr_code?: QRCodeData | null } }>(
        `/api/provider/bookings/${bookingId}/arrive`,
        {
          ...(latitude != null && { latitude }),
          ...(longitude != null && { longitude }),
        }
      );
      const qr = arriveRes.data?.qr_code;
      setBackupArrivalQr(qr && typeof qr === "object" && "verification_code" in qr ? qr : null);
      toast.success("Marked as arrived.");
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to mark arrived");
    } finally {
      setIsMarkingArrived(false);
    }
  };

  const handleVerifyArrival = async () => {
    const code = arrivalPinInput.replace(/\D/g, "");
    if (code.length !== 4 && code.length !== 6) {
      toast.error(ARRIVAL_PIN_TOAST_PROVIDER_INCOMPLETE);
      return;
    }
    setIsVerifyingArrival(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/verify-arrival`, { otp: code });
      toast.success("Verified. You can start the service.");
      setArrivalPinInput("");
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to verify");
    } finally {
      setIsVerifyingArrival(false);
    }
  };

  const handleResendArrivalOtp = async () => {
    setIsResendingArrivalOtp(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/resend-arrival-otp`, {});
      toast.success("New code sent to customer.");
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to resend");
    } finally {
      setIsResendingArrivalOtp(false);
    }
  };

  const handleOverrideArrivalVerification = async () => {
    const reasonText = prompt(
      "Customer can't verify — briefly describe why (required for audit):",
    );
    if (!reasonText?.trim()) return;
    setIsOverridingArrival(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/override-arrival-verification`, {
        reason_code: "other",
        reason_text: reasonText.trim(),
      });
      toast.success("Arrival verified manually. You can start the service.");
      loadBooking();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to override verification");
    } finally {
      setIsOverridingArrival(false);
    }
  };

  /**
   * P8 (audit 2026-04): manually fire provider → customer notifications
   * via the existing REST routes. These were previously only callable from
   * the WaitingRoom server actions; the detail page had no UI.
   */
  const handleResendNotification = async (
    type: "confirmation" | "reminder",
  ) => {
    setIsNotifying(true);
    try {
      const res = await fetcher.post(
        `/api/provider/bookings/${bookingId}/notify-resend`,
        { type },
      );
      const r = (res ?? {}) as { sent?: boolean; error?: string };
      if (r.sent) {
        toast.success(
          type === "confirmation"
            ? "Confirmation re-sent to customer."
            : "Reminder sent to customer.",
        );
      } else {
        toast.error(r.error || "Notification could not be sent.");
      }
    } catch (err) {
      toast.error(
        err instanceof FetchError
          ? err.message
          : "Failed to send notification",
      );
    } finally {
      setIsNotifying(false);
    }
  };

  const handleSendCancellationNotice = async () => {
    setIsNotifying(true);
    try {
      // Infer the cancellation_type the server expects. `no_show` and
      // `late_cancel` are meaningful for refund/fee accounting — we route
      // the detail page's generic button to `normal` unless the booking is
      // already marked `no_show`, matching the validator contract.
      const cancellation_type = isNoShow ? "no_show" : "normal";
      const res = await fetcher.post(
        `/api/provider/bookings/${bookingId}/notify-cancellation`,
        { cancellation_type },
      );
      const r = (res ?? {}) as { sent?: boolean; error?: string };
      if (r.sent) {
        toast.success("Cancellation notice sent to customer.");
      } else {
        toast.error(r.error || "Cancellation notice could not be sent.");
      }
    } catch (err) {
      toast.error(
        err instanceof FetchError
          ? err.message
          : "Failed to send cancellation notice",
      );
    } finally {
      setIsNotifying(false);
    }
  };

  const submitVerifyQrBody = async (body: {
    verification_code?: string;
    qr_data?: string;
  }): Promise<boolean> => {
    setIsVerifyingQrArrival(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/verify-qr`, body);
      toast.success("Verified. You can start the service.");
      setQrArrivalCodeInput("");
      setQrPasteJson("");
      loadBooking();
      return true;
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to verify QR");
      return false;
    } finally {
      setIsVerifyingQrArrival(false);
    }
  };

  const handleVerifyQrArrival = async () => {
    const trimmedPaste = qrPasteJson.trim();
    const code = qrArrivalCodeInput.replace(/\s/g, "").toUpperCase();
    const body: { verification_code?: string; qr_data?: string } = {};
    if (trimmedPaste.startsWith("{")) {
      body.qr_data = trimmedPaste;
    } else if (code.length >= 8) {
      body.verification_code = code;
    } else {
      toast.error(
        "Enter the 8-character code from the customer’s QR, paste the full scanned JSON, or use Scan with camera."
      );
      return;
    }
    await submitVerifyQrBody(body);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading booking details..." />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Booking not found"
          description={error || "The booking you're looking for doesn't exist"}
          action={{
            label: "Go Back",
            onClick: () => router.push("/provider/bookings"),
          }}
        />
      </div>
    );
  }

  const b = booking;
  /** Snapshot avoids TS narrowing `status` after `.includes()` checks below (TS 5.x). */
  const bookingLifecycleStatus = b.status as Booking["status"];

  const unpaidChargesTotal = useMemo(
    () => additionalCharges
      .filter((ac) => ac.status !== "paid" && ac.status !== "rejected")
      .reduce((sum, ac) => sum + Number(ac.amount ?? 0), 0),
    [additionalCharges],
  );

  const isActive = ["pending", "booked", "confirmed", "waiting", "checked_in"].includes(bookingLifecycleStatus);
  const isStarted = ["started", "in_progress"].includes(bookingLifecycleStatus);
  const isCancelled = bookingLifecycleStatus === "cancelled";
  const isNoShow = bookingLifecycleStatus === "no_show";
  // "confirmed" means provider has actually confirmed the booking (not just pending/awaiting).
  const isConfirmedOrLater = ["booked", "confirmed", "waiting", "checked_in", "started", "in_progress"].includes(bookingLifecycleStatus);
  const isAtHome = b.location_type === "at_home";
  const canStartJourney =
    canEditAppointments &&
    isAtHome &&
    (bookingLifecycleStatus === "confirmed" || bookingLifecycleStatus === "booked") &&
    (b.current_stage == null || b.current_stage === "confirmed");
  const canMarkArrived =
    canEditAppointments && isAtHome && b.current_stage === "provider_on_way";
  const isEnRoute = isAtHome && b.current_stage === "provider_on_way";
  const isArrived = isAtHome && b.current_stage === "provider_arrived";
  const arrivalVerified =
    b.arrival_otp_verified === true || b.qr_code_verified === true;
  const arrivalOtpPending = b.arrival_otp_pending === true;
  const qrArrivalPending = b.qr_arrival_pending === true;
  /**
   * Mirrors `filterInProgressWhenAtHomeVerificationPending` in the provider app so we do not
   * offer Start Service while PIN/QR is still pending (POST start-service would reject with
   * VERIFICATION_NOT_COMPLETE when a verification method exists).
   */
  const atHomeHouseCallReadyForServiceStart =
    isAtHome &&
    b.current_stage === "provider_arrived" &&
    !(!arrivalVerified && (arrivalOtpPending || qrArrivalPending));
  /** Same lifecycle gate as provider mobile `allowedStatusTargets` / PATCH policy. */
  const canStartService =
    canEditAppointments &&
    ["confirmed", "booked", "checked_in", "waiting"].includes(bookingLifecycleStatus) &&
    (!isAtHome || atHomeHouseCallReadyForServiceStart);
  const canStartServiceInJourney = canStartService && isArrived;
  const totalPaid = b.total_paid ?? 0;
  const totalRefunded = b.total_refunded ?? 0;
  const totalAmount = b.total_amount ?? 0;
  const walletAmountApplied = Number((b as unknown as Record<string, unknown>).wallet_amount ?? 0);
  const giftCardAmountApplied = Number((b as unknown as Record<string, unknown>).gift_card_amount ?? 0);
  const outstanding = computeBookingOutstandingDisplay({
    totalAmount,
    totalPaid,
    totalRefunded,
    walletAmount: walletAmountApplied,
    giftCardAmount: giftCardAmountApplied,
    unpaidAdditionalCharges: unpaidChargesTotal,
    paymentStatus: b.payment_status,
  });
  const paymentDisplay = getBookingPaymentDisplay({
    paymentStatus: b.payment_status,
    outstandingBalance: outstanding,
    paymentOption: (b as unknown as Record<string, unknown>).payment_option as string | null | undefined,
    depositRequired: (b as unknown as Record<string, unknown>).deposit_required as boolean | null | undefined,
  });
  const netPaidAfterRefunds = totalPaid - totalRefunded;
  const maxRefundable = Math.max(0, netPaidAfterRefunds);
  const canMarkPaid =
    canProcessPayments &&
    outstanding > 0 &&
    (bookingLifecycleStatus === "completed" || isStarted);
  const canRefund =
    canProcessPayments && totalPaid > 0 && totalRefunded < totalPaid;
  /** Matches provider app + POST /send-payment-link (API rejects if already paid; needs email/SMS contact) */
  const canSendPaymentLink =
    canProcessPayments &&
    paymentLinkEnabled &&
    outstanding > 0 &&
    bookingLifecycleStatus !== "cancelled" &&
    b.payment_status !== "paid" &&
    !!(b.customer_email || b.customer_phone);
  const showYocoPayButton = yocoEnabled && yocoIntegrationEnabled && canMarkPaid;
  const showPaycloudPayButton = paycloudEnabled && canMarkPaid;
  const bookingCurrency = (b as { currency?: string }).currency ?? "ZAR";
  const paycloudCollectContext = inferBookingCollectContext({
    totalAmount,
    totalPaid,
    unpaidAdditionalCharges: unpaidChargesTotal,
    outstanding,
  });
  const markPaidPaymentMethods = useMemo(() => {
    const methods: { label: string; value: PaymentMethodMain; helper?: string }[] =
      PAYMENT_METHODS_MAIN_BASE.filter((m) => m.value !== "card" || manualCardEnabled);
    if (paystackTerminalReady) {
      methods.splice(2, 0, { label: "Paystack Terminal", value: "paystack_terminal" });
    }
    if (paycloudEnabled && paycloudCollectEnabled) {
      methods.splice(2, 0, {
        label: formatPaycloudCollectLabel({
          context: paycloudCollectContext,
          amount: 0,
          currency: bookingCurrency,
        }),
        value: "paycloud_terminal",
      });
    }
    return methods;
  }, [
    bookingCurrency,
    manualCardEnabled,
    paycloudCollectContext,
    paycloudCollectEnabled,
    paycloudEnabled,
    paystackTerminalReady,
  ]);
  const chargePaymentMethods = useMemo(
    () =>
      [
        ...PAYMENT_METHODS_CHARGE_BASE.filter((m) => m.value !== "card" || manualCardEnabled),
        ...(paycloudEnabled && paycloudCollectEnabled
          ? [{ label: "Card machine", value: "paycloud_terminal" as const }]
          : []),
      ],
    [manualCardEnabled, paycloudCollectEnabled, paycloudEnabled],
  );
  const showPaystackTerminalButton = paystackTerminalReady && canMarkPaid;
  const actionModel = useMemo(
    () =>
      buildProviderBookingActionModel({
        id: bookingId,
        status: b.status,
        db_status: b.db_status,
        payment_status: b.payment_status,
        scheduled_at: b.scheduled_at,
        location_type: b.location_type,
        location_id: b.location_id,
        current_stage: b.current_stage,
        arrival_otp_verified: b.arrival_otp_verified,
        qr_code_verified: b.qr_code_verified,
        arrival_otp_pending: b.arrival_otp_pending,
        qr_arrival_pending: b.qr_arrival_pending,
      }),
    [
      bookingId,
      b.status,
      b.db_status,
      b.payment_status,
      b.scheduled_at,
      b.location_type,
      b.location_id,
      b.current_stage,
      b.arrival_otp_verified,
      b.qr_code_verified,
      b.arrival_otp_pending,
      b.qr_arrival_pending,
    ],
  );

  const actionAllowedByPermission = (action: ProviderBookingAction) => {
    if (action.id === "cancel" || action.id === "mark_no_show") return canCancelAppointments;
    return canEditAppointments;
  };

  const permittedPrimaryAction =
    actionModel.primaryAction && actionAllowedByPermission(actionModel.primaryAction)
      ? actionModel.primaryAction
      : null;

  const runBookingAction = (action: ProviderBookingAction) => {
    if (!actionAllowedByPermission(action)) {
      toast.error("You do not have permission for this action");
      return;
    }
    if (action.id === "start_journey") return void handleStartJourney();
    if (action.id === "mark_arrived") return void handleMarkArrived();
    if (action.id === "start_service") return void handleStatusChange("started");
    if (action.id === "complete_service") return void handleStatusChange("completed");
    if (action.id === "cancel") return void handleStatusChange("cancelled");
    if (action.id === "mark_no_show") return void handleStatusChange("no_show");
    if (action.id === "check_in") return void handleStatusChange("checked_in");
    return void handleStatusChange(action.dbTarget);
  };

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
          <Link
            href="/provider/bookings"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Bookings
          </Link>
          <div className="flex items-center gap-2">
            <SafetyPanicButton bookingId={bookingId} variant="outline" size="sm" />
            <BookingAuditLog bookingId={bookingId} />
          </div>
        </div>

        {/* Conflict Alert */}
        {conflictError && (
          <BookingConflictAlert
            conflictMessage={conflictError}
            onRefresh={() => {
              setConflictError(null);
              loadBooking();
            }}
            onDismiss={() => setConflictError(null)}
          />
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">
              Booking #{booking.booking_number}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  booking.status === "confirmed" || booking.status === "booked"
                    ? "bg-green-100 text-green-800"
                    : booking.status === "pending"
                    ? "bg-yellow-100 text-yellow-800"
                    : booking.status === "cancelled"
                    ? "bg-red-100 text-red-800"
                    : booking.status === "started" || booking.status === "in_progress"
                    ? "bg-blue-100 text-blue-800"
                    : booking.status === "completed"
                    ? "bg-emerald-100 text-emerald-800"
                    : booking.status === "no_show"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {booking.status === "booked"
                  ? "Confirmed"
                  : booking.status === "started"
                  ? "In Progress"
                  : booking.status === "in_progress"
                  ? "In Progress"
                  : booking.status === "no_show"
                  ? "No Show"
                  : booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace(/_/g, " ")}
              </span>
              {(booking as any).booking_source === "walk_in" && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Walk-in</span>
              )}
              {(booking as any).group_booking_ref && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">Group</span>
              )}
              {(booking as { custom_offer_id?: string | null }).custom_offer_id ? (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                  Custom offer
                </span>
              ) : null}
              {(booking as { referral_source_name?: string | null }).referral_source_name ? (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  Found you via {(booking as { referral_source_name?: string | null }).referral_source_name}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <ShareReceiptButton kind="provider-booking" subjectId={bookingId} />
            <a
              href={`/api/provider/bookings/${bookingId}/receipt/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              View Receipt PDF
            </a>
          </div>
        </div>

        {booking.status === "cancelled" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-1">Booking Cancelled</h3>
            {(booking as any).cancellation_reason && (
              <p className="text-sm text-red-700">
                <span className="font-medium">Reason:</span> {(booking as any).cancellation_reason}
              </p>
            )}
            {(booking as any).cancelled_at && (
              <p className="text-xs text-red-500 mt-1">
                Cancelled on {new Date((booking as any).cancelled_at).toLocaleString()}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Customer Info */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Customer Information</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-medium flex items-center gap-2">
                  <span>{booking.customer_name || booking.customers?.full_name || "Guest"}</span>
                  {(booking.customers as { identity_verified?: boolean | null } | null)
                    ?.identity_verified ? (
                    <VerifiedBadge verified />
                  ) : null}
                </p>
              </div>
              {booking.customers?.rating_average != null && Number(booking.customers?.rating_average) > 0 && (
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="text-sm font-semibold text-gray-800">
                    {Number(booking.customers?.rating_average).toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({Number(booking.customers?.review_count ?? 0)} {booking.customers?.review_count === 1 ? "review" : "reviews"})
                  </span>
                </div>
              )}
              {booking.customer_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <a
                    href={`tel:${booking.customer_phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {booking.customer_phone}
                  </a>
                </div>
              )}
              {booking.customer_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a
                    href={`mailto:${booking.customer_email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {booking.customer_email}
                  </a>
                </div>
              )}
              {(booking.status === "completed" || booking.status === "no_show") && bookingId && (
                <div className="pt-2 border-t">
                  <CustomerRatingButton
                    bookingId={String(bookingId)}
                    customerId={booking.customer_id ?? ""}
                    customerName={typeof booking.customer_name === "string" ? booking.customer_name : typeof booking.customers?.full_name === "string" ? booking.customers.full_name : "Guest"}
                    bookingStatus={booking.status}
                    onRatingSubmitted={() => loadBooking()}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Booking Details */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Booking Details</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">
                    {formatBookingDateInTimeZone(booking.scheduled_at, booking.display_time_zone)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Time</p>
                  <p className="font-medium">
                    {formatBookingTimeInTimeZone(booking.scheduled_at, booking.display_time_zone)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Location</p>
                  {booking.location_type === "at_salon" ? (
                    <p className="font-medium">
                      {booking.location_name || "At Salon"}
                    </p>
                  ) : booking.address ? (
                    <div className="space-y-1">
                      <p className="font-medium">
                        {booking.address.line1}
                        {booking.address.line2 && `, ${booking.address.line2}`}
                      </p>
                      {booking.address.apartment_unit && (
                        <p className="text-sm text-gray-600">Unit: {booking.address.apartment_unit}</p>
                      )}
                      {booking.address.building_name && (
                        <p className="text-sm text-gray-600">Building: {booking.address.building_name}</p>
                      )}
                      {booking.address.floor_number && (
                        <p className="text-sm text-gray-600">Floor: {booking.address.floor_number}</p>
                      )}
                      <p className="text-sm text-gray-600">
                        {booking.address.city}
                        {booking.address.state && `, ${booking.address.state}`}
                        {booking.address.postal_code && ` ${booking.address.postal_code}`}
                      </p>
                      <p className="text-sm text-gray-600">{booking.address.country}</p>
                      {booking.address.access_codes && (
                        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                          <p className="text-xs font-medium text-gray-700">Access Codes:</p>
                          {typeof booking.address.access_codes === 'object' && (
                            <>
                              {booking.address.access_codes.gate && (
                                <p className="text-xs text-gray-600">Gate: {booking.address.access_codes.gate}</p>
                              )}
                              {booking.address.access_codes.buzzer && (
                                <p className="text-xs text-gray-600">Buzzer: {booking.address.access_codes.buzzer}</p>
                              )}
                              {booking.address.access_codes.door && (
                                <p className="text-xs text-gray-600">Door: {booking.address.access_codes.door}</p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {booking.address.parking_instructions && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-medium text-gray-700">Parking:</p>
                          <p className="text-xs text-gray-600">{booking.address.parking_instructions}</p>
                        </div>
                      )}
                      {booking.address.location_landmarks && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-medium text-gray-700">Landmarks:</p>
                          <p className="text-xs text-gray-600">{booking.address.location_landmarks}</p>
                        </div>
                      )}
                      {booking.address.latitude && booking.address.longitude && (
                        <a
                          href={`https://www.mapbox.com/directions/?destination=${booking.address.longitude},${booking.address.latitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                        >
                          View on map →
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="font-medium">At customer location</p>
                  )}
                </div>
              </div>
              {booking.staff_name && (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Assigned Staff</p>
                    <p className="font-medium">{booking.staff_name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* At-home visit: Start journey, Mark arrived, location tracker */}
        {isAtHome && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">At-home visit</h2>
            <HouseCallExcellenceNote />
            <div className="space-y-4">
              {canStartJourney && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Notify the customer you&apos;re on the way (optional ETA):</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleStartJourney()}
                      disabled={isStartingJourney}
                      variant="outline"
                      className="min-h-[44px]"
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      Start journey (no ETA)
                    </Button>
                    {[15, 30, 45].map((mins) => (
                      <Button
                        key={mins}
                        onClick={() => handleStartJourney(mins)}
                        disabled={isStartingJourney}
                        className="min-h-[44px] bg-primary hover:bg-primary-hover"
                      >
                        <Navigation className="w-4 h-4 mr-2" />
                        ETA {mins} min
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {canMarkArrived && (
                <div>
                  <Button
                    onClick={handleMarkArrived}
                    disabled={isMarkingArrived}
                    className="min-h-[44px] bg-green-600 hover:bg-green-700"
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    {isMarkingArrived ? "Marking arrived…" : "Mark arrived"}
                  </Button>
                </div>
              )}
              {isArrived && (
                <div className="space-y-3">
                  <p
                    className={`text-sm font-medium rounded-lg border py-2 px-3 ${
                      arrivalVerified
                        ? "text-green-800 bg-green-50 border-green-200"
                        : "text-amber-900 bg-amber-50 border-amber-200"
                    }`}
                  >
                    {arrivalVerified
                      ? "Customer verified – you can start the service."
                      : "Provider arrived — complete PIN or QR verification when shown below, or start service if none is required."}
                  </p>
                  {canStartServiceInJourney && (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        onClick={() => handleStatusChange("started")}
                        disabled={isUpdating}
                        className="min-h-[44px] bg-blue-600 hover:bg-blue-700"
                      >
                        Start service
                      </Button>
                      <p className="text-xs text-gray-500">
                        Same action as <span className="font-medium">Start Service</span> in status actions below.
                        Cancel and no-show stay there.
                      </p>
                    </div>
                  )}
                  {!arrivalVerified && (
                    <>
                      {arrivalOtpPending && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
                          <p className="text-sm font-medium text-blue-900">{ARRIVAL_PIN_PROVIDER_HEADING}</p>
                          <p className="text-xs text-blue-800/90">{ARRIVAL_PIN_PROVIDER_SUBTEXT}</p>
                          <p className="text-xs text-blue-800/90">{ARRIVAL_PIN_LENGTH_HINT}</p>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={arrivalPinInput}
                            onChange={(e) => setArrivalPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder={ARRIVAL_PIN_PLACEHOLDER}
                            className="w-full max-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-lg tracking-widest"
                            aria-label={ARRIVAL_PIN_PROVIDER_HEADING}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={handleVerifyArrival}
                              disabled={
                                isVerifyingArrival ||
                                ![4, 6].includes(arrivalPinInput.replace(/\D/g, "").length)
                              }
                              className="min-h-[44px]"
                            >
                              {isVerifyingArrival ? "Verifying…" : "Verify"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleResendArrivalOtp}
                              disabled={isResendingArrivalOtp}
                              className="min-h-[44px]"
                            >
                              {isResendingArrivalOtp ? "Sending…" : "Resend code & QR"}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={handleOverrideArrivalVerification}
                              disabled={isOverridingArrival}
                              className="min-h-[44px] text-amber-800"
                            >
                              {isOverridingArrival ? "Saving…" : "Customer can't verify?"}
                            </Button>
                          </div>
                        </div>
                      )}
                      {qrArrivalPending && (
                        <div className="rounded-lg bg-violet-50 border border-violet-200 p-4 space-y-3">
                          <p className="text-sm font-medium text-violet-950">Scan the customer&apos;s QR or enter their code</p>
                          <p className="text-xs text-violet-800">
                            They open this booking on their phone to show the arrival QR, or read the 8-character code aloud.
                            {arrivalOtpPending
                              ? " If it expired, use Resend in the PIN section — the customer gets a fresh code and QR."
                              : " If it expired, use Resend below — the customer gets a fresh code and QR."}
                          </p>
                          {!arrivalOtpPending && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleResendArrivalOtp}
                              disabled={isResendingArrivalOtp}
                              className="min-h-[44px] w-full border-violet-300 text-violet-900"
                            >
                              {isResendingArrivalOtp ? "Sending…" : "Resend QR & code to customer"}
                            </Button>
                          )}
                          <input
                            type="text"
                            value={qrArrivalCodeInput}
                            onChange={(e) =>
                              setQrArrivalCodeInput(
                                e.target.value.replace(/\s/g, "").toUpperCase().slice(0, 12)
                              )
                            }
                            placeholder="e.g. AB12CD34"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 font-mono text-base"
                            aria-label="QR verification code from customer"
                          />
                          <label className="block text-xs font-medium text-violet-900">Or paste raw scan (JSON)</label>
                          <textarea
                            value={qrPasteJson}
                            onChange={(e) => setQrPasteJson(e.target.value)}
                            placeholder='{"booking_id":"…"'
                            rows={3}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                            aria-label="Pasted QR JSON"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setQrScanDialogOpen(true)}
                            disabled={isVerifyingQrArrival}
                            className="min-h-[44px] w-full border-violet-600 text-violet-900 mb-2"
                          >
                            Scan with camera
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void handleVerifyQrArrival()}
                            disabled={
                              isVerifyingQrArrival ||
                              (qrPasteJson.trim().length === 0 &&
                                qrArrivalCodeInput.replace(/\s/g, "").length < 8)
                            }
                            className="min-h-[44px] bg-violet-700 hover:bg-violet-800"
                          >
                            {isVerifyingQrArrival ? "Verifying…" : "Verify QR"}
                          </Button>
                        </div>
                      )}
                      {backupArrivalQr && (
                        <div className="rounded-lg border border-dashed border-gray-300 p-3 bg-gray-50/80">
                          <p className="text-xs text-gray-600 mb-2">
                            Backup: same QR the customer sees (e.g. if they can&apos;t open the app).
                          </p>
                          <QRCodeDisplay
                            qrData={backupArrivalQr}
                            onRefresh={() => loadBooking()}
                            title="Customer arrival QR (backup)"
                            description="Prefer the customer’s app when possible."
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {canEditAppointments && isEnRoute && (
                <ProviderLocationTracker
                  bookingId={bookingId}
                  destination={
                    booking?.address?.latitude != null && booking?.address?.longitude != null
                      ? {
                          latitude: booking.address.latitude,
                          longitude: booking.address.longitude,
                        }
                      : undefined
                  }
                  autoStart={true}
                />
              )}
            </div>
          </div>
        )}

        {/* Services */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Services</h2>
          <div className="space-y-3">
            {booking.services?.map((service, index) => (
              <div
                key={index}
                className="flex justify-between items-center py-3 border-b last:border-0"
              >
                <div>
                  <p className="font-medium">{service.offering_name || "Service"}</p>
                  {service.duration_minutes != null && (
                    <p className="text-sm text-gray-600">{service.duration_minutes} mins</p>
                  )}
                </div>
                {service.price != null && (
                  <p className="font-medium">
                    {booking.currency} {Number(service.price).toFixed(2)}
                  </p>
                )}
              </div>
            ))}
            {(!booking.services || booking.services.length === 0) && (
              <p className="text-sm text-gray-500">No services</p>
            )}
          </div>
          {(booking as ProviderBookingDetail & { custom_offer?: { notes?: string | null; request?: { description?: string | null } | null } | null }).custom_offer &&
           ((booking as any).custom_offer?.request?.description || (booking as any).custom_offer?.notes) ? (
            <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                ✦ Custom Order
              </p>
              {(booking as any).custom_offer?.request?.description ? (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">Client's request</p>
                  <p className="text-sm text-violet-900 leading-relaxed">{(booking as any).custom_offer.request.description}</p>
                </div>
              ) : null}
              {(booking as any).custom_offer?.notes ? (
                <div>
                  <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">Your notes</p>
                  <p className="text-sm text-violet-900 leading-relaxed">{(booking as any).custom_offer.notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Products */}
        {booking.products && booking.products.length > 0 && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Products</h2>
            <div className="space-y-3">
              {booking.products.map((product, index: number) => (
                <div
                  key={product.id || index}
                  className="flex justify-between items-center py-3 border-b last:border-0"
                >
                  <div>
                    <p className="font-medium">{product.product_name || "Product"}</p>
                    <p className="text-sm text-gray-600">Quantity: {product.quantity}</p>
                  </div>
                  <p className="font-medium">
                    {booking.currency} {product.total_price.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Special Requests & House Call Instructions */}
        {(booking.special_requests || booking.house_call_instructions) && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Special Instructions</h2>
            <div className="space-y-4">
              {booking.special_requests && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">General Requests</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{booking.special_requests}</p>
                </div>
              )}
              {booking.house_call_instructions && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-1">House Call Instructions</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{booking.house_call_instructions}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Provider form responses (intake/consent/waiver filled at checkout) */}
        {booking.provider_form_responses && Object.keys(booking.provider_form_responses).length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Form responses</h2>
            <div className="space-y-4">
              {Object.entries(booking.provider_form_responses).map(([formId, fields]) => {
                const formMeta = providerForms.find((f) => f.id === formId);
                const formTitle = formMeta?.title ?? `Form ${formId.slice(0, 8)}`;
                const formType = formMeta?.form_type ?? "";
                const isConsentOrWaiver = formType === "consent" || formType === "waiver";
                const consentUrl = typeof fields === "object" && fields !== null && (fields as Record<string, unknown>)._consent_document_url as string | undefined;
                const getFieldName = (fieldId: string) => formMeta?.fields?.find((f) => f.id === fieldId)?.name ?? fieldId.slice(0, 8);
                const visibleEntries = typeof fields === "object" && fields !== null
                  ? Object.entries(fields).filter(([k]) => k !== "_consent_document_url")
                  : [];
                return (
                  <div key={formId} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-2">{formTitle}</p>
                    <dl className="space-y-2">
                      {visibleEntries.map(([fieldKey, value]) => (
                        <div key={fieldKey} className="flex justify-between gap-2 text-sm">
                          <dt className="text-gray-600">{getFieldName(fieldKey)}</dt>
                          <dd className="text-gray-900 font-medium text-right break-all">
                            {value === null || value === undefined ? "—" : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {isConsentOrWaiver && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {consentUrl && (
                          <a
                            href={consentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            View consent document
                          </a>
                        )}
                        <label className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900">
                          <input
                            type="file"
                            accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            disabled={!!uploadingConsentFormId}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f || !bookingId) return;
                              setUploadingConsentFormId(formId);
                              try {
                                const body = new FormData();
                                body.set("form_id", formId);
                                body.set("file", f);
                                await fetcher.post(`/api/provider/bookings/${bookingId}/consent-document`, body);
                                toast.success("Document uploaded");
                                await loadBooking();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Upload failed");
                              } finally {
                                setUploadingConsentFormId(null);
                                e.target.value = "";
                              }
                            }}
                          />
                          {consentUrl ? "Replace document" : "Upload consent document"}
                        </label>
                        {uploadingConsentFormId === formId && <span className="text-xs text-gray-500">Uploading…</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Additional details (platform booking custom fields) */}
        {booking.custom_field_values && Object.keys(booking.custom_field_values).length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Additional details</h2>
            <dl className="space-y-2">
              {Object.entries(booking.custom_field_values).map(([name, value]) => (
                <div key={name} className="flex justify-between gap-2 text-sm">
                  <dt className="text-gray-600">{name}</dt>
                  <dd className="text-gray-900 font-medium text-right break-all">
                    {value === null || value === undefined ? "—" : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Resource Assignments */}
        {bookingId && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
            <ResourceAssignmentPanel
              bookingId={bookingId}
              bookingDate={booking.scheduled_at ? new Date(booking.scheduled_at) : new Date()}
              bookingTime={booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              onUpdate={loadBooking}
            />
          </div>
        )}

        {/* Payment Summary */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Payment Summary</h2>
          <OnPlatformPaymentNote
            bookingId={bookingId}
            show={outstanding > 0 && booking.status !== "cancelled"}
          />
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">
                {booking.currency} {(Number(booking.subtotal) || 0).toFixed(2)}
              </span>
            </div>
            {Number((booking as any).discount_amount ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Discount</span>
                <span className="font-medium text-green-600">
                  −{booking.currency} {Number((booking as any).discount_amount).toFixed(2)}
                </span>
              </div>
            )}
            {Number((booking as any).promotion_discount_amount ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Promotion</span>
                <span className="font-medium text-green-600">
                  −{booking.currency} {Number((booking as any).promotion_discount_amount).toFixed(2)}
                </span>
              </div>
            )}
            {Number((booking as any).membership_discount_amount ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Membership</span>
                <span className="font-medium text-green-600">
                  −{booking.currency} {Number((booking as any).membership_discount_amount).toFixed(2)}
                </span>
              </div>
            )}
            {Number((booking as any).loyalty_discount_amount ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Loyalty</span>
                <span className="font-medium text-green-600">
                  −{booking.currency} {Number((booking as any).loyalty_discount_amount).toFixed(2)}
                </span>
              </div>
            )}
            {booking.travel_fee != null && booking.travel_fee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Travel Fee</span>
                <span className="font-medium">
                  {booking.currency} {booking.travel_fee.toFixed(2)}
                </span>
              </div>
            )}
            {booking.service_fee_amount != null && booking.service_fee_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Platform Fee</span>
                <span className="font-medium">
                  {booking.currency} {booking.service_fee_amount.toFixed(2)}
                </span>
              </div>
            )}
            {booking.tax_amount != null && booking.tax_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {booking.tax_rate != null && booking.tax_rate > 0
                    ? `VAT (${(booking.tax_rate * 100).toFixed(1)}%)`
                    : "Tax"}
                </span>
                <span className="font-medium text-blue-600">
                  {booking.currency} {booking.tax_amount.toFixed(2)}
                </span>
              </div>
            )}
            {booking.tip_amount != null && booking.tip_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tip</span>
                <span className="font-medium">
                  {booking.currency} {booking.tip_amount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-semibold text-lg">
                  {booking.currency} {(booking.total_amount?.toFixed(2)) ?? "0.00"}
                </span>
              </div>
            </div>
            {booking.tax_amount != null && booking.tax_amount > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs text-gray-500">
                  {booking.tax_rate != null && booking.tax_rate > 0
                    ? `VAT (${(booking.tax_rate * 100).toFixed(1)}%) amount: `
                    : "Tax amount: "}
                  {booking.currency} {booking.tax_amount.toFixed(2)}.
                  {booking.tax_rate != null && booking.tax_rate >= 0.15
                    ? " This amount must be remitted to SARS by the provider."
                    : ""}
                </p>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-600 mt-2">
              <span>Payment Status</span>
              <span
                className={`font-medium ${
                  paymentDisplay.tone === "success"
                    ? "text-green-600"
                    : paymentDisplay.tone === "warning"
                    ? "text-yellow-600"
                    : paymentDisplay.tone === "danger"
                      ? "text-red-600"
                      : "text-gray-600"
                }`}
              >
                {paymentDisplay.label}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Charges */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Additional Charges</h2>
            <Button variant="outline" onClick={loadAdditionalCharges}>
              Refresh
            </Button>
          </div>

          {settlementPlan && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <span className="font-medium">Recommended: </span>
              {settlementPlan.recommendedAction === "charge_card_on_file"
                ? "Charge card on file (customer must approve first)"
                : settlementPlan.recommendedAction === "customer_pay"
                ? "Send to customer — they pay in-app or online"
                : "Collect in person (cash, card, or Paystack Terminal)"}
            </div>
          )}

          {additionalCharges.length === 0 ? (
            <p className="text-sm text-gray-600">No additional charges for this booking.</p>
          ) : (
            <div className="space-y-3">
              {additionalCharges.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 border rounded-lg ${
                    c.status === 'paid'
                      ? 'bg-green-50 border-green-200'
                      : c.status === 'pending' || c.status === 'approved'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{c.description}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {c.currency} {Number(c.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested: {c.requested_at ? new Date(c.requested_at).toLocaleString() : "N/A"}
                      </p>
                      {c.paid_at && (
                        <p className="text-xs text-green-600 mt-1">
                          Paid: {new Date(c.paid_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        c.status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : c.status === 'pending' || c.status === 'approved'
                          ? 'bg-yellow-100 text-yellow-800'
                          : c.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {c.status === 'approved' ? 'approved (awaiting payment)' : c.status}
                    </span>
                  </div>
                  {(c.status === 'pending' || c.status === 'approved') && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-2">
                        Send a reminder to the customer, or mark as paid if you received payment in person:
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendChargeToClient(c.id)}
                          disabled={sendingChargeNotify === c.id}
                        >
                          {sendingChargeNotify === c.id ? "Sending…" : "Send to client"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setChargeMarkPaidId(c.id);
                            setChargeMarkPaidMethod("card");
                          }}
                          disabled={markingChargePaid}
                        >
                          Mark as Paid (Walk-in/In-Salon)
                        </Button>
                        {paycloudEnabled && (
                          <PaycloudCollectButton
                            amount={Number(c.amount ?? 0)}
                            currency={bookingCurrency}
                            context="additional_charge"
                            onClick={() =>
                              openPaycloudAdditionalCharge(c.id, Number(c.amount ?? 0))
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {["confirmed", "in_progress", "completed"].includes(booking.status) && (
            <div className="mt-6 border-t pt-4">
              <h3 className="font-semibold mb-2">Send additional charge</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  placeholder="Description"
                  value={chargeDescription}
                  onChange={(e) => setChargeDescription(e.target.value)}
                  className="md:col-span-2"
                />
                <Input
                  placeholder="Amount"
                  inputMode="decimal"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                />
              </div>
              <Button
                className="mt-3"
                onClick={handleRequestAdditionalCharge}
                disabled={isRequestingCharge}
              >
                {isRequestingCharge ? "Sending…" : "Send additional charge"}
              </Button>
            </div>
          )}
        </div>

        {/* Payment Summary */}
        {booking.status !== "pending" && (
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Payment Details</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total</span>
              <span className="font-medium">{formatMoney(totalAmount)}</span>
            </div>
            {Number((booking as any).discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  Discount{(booking as any).discount_code ? ` (${(booking as any).discount_code})` : ""}
                </span>
                <span className="font-medium text-green-600">−{formatMoney(Number((booking as any).discount_amount))}</span>
              </div>
            )}
            {Number((booking as any).promotion_discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Promotion</span>
                <span className="font-medium text-green-600">
                  −{formatMoney(Number((booking as any).promotion_discount_amount))}
                </span>
              </div>
            )}
            {Number((booking as any).membership_discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Membership</span>
                <span className="font-medium text-green-600">
                  −{formatMoney(Number((booking as any).membership_discount_amount))}
                </span>
              </div>
            )}
            {Number((booking as any).loyalty_discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Loyalty</span>
                <span className="font-medium text-green-600">
                  −{formatMoney(Number((booking as any).loyalty_discount_amount))}
                </span>
              </div>
            )}
            {Number((booking as any).travel_fee ?? (booking as any).travel_fee_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Travel fee</span>
                <span className="font-medium">{formatMoney(Number((booking as any).travel_fee ?? (booking as any).travel_fee_amount ?? 0))}</span>
              </div>
            )}
            {(booking as any).deposit_required && (booking as any).payment_option === "deposit" && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Deposit required</span>
                <span className="font-medium">{formatMoney(Number((booking as any).deposit_amount ?? 0))}</span>
              </div>
            )}
            {walletAmountApplied > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Wallet applied</span>
                <span className="font-medium text-gray-900">{formatMoney(walletAmountApplied)}</span>
              </div>
            )}
            {giftCardAmountApplied > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Gift card applied</span>
                <span className="font-medium text-gray-900">{formatMoney(giftCardAmountApplied)}</span>
              </div>
            )}
            {totalPaid > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payments recorded</span>
                <span className="font-medium text-green-600">{formatMoney(totalPaid)}</span>
              </div>
            )}
            {totalRefunded > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Refunded</span>
                <span className="font-medium text-red-600">−{formatMoney(totalRefunded)}</span>
              </div>
            )}
            {outstanding > 0 && (
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-gray-700 font-medium">Outstanding</span>
                <span className="font-bold text-amber-600">{formatMoney(outstanding)}</span>
              </div>
            )}
          </div>
        )}

        {/* Guided status flow */}
        <div className="rounded-lg border bg-white p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Next booking step
              </p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">
                {actionModel.stepTitle}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {actionModel.stepDescription}
              </p>
            </div>
            {permittedPrimaryAction && (
              <Button
                onClick={() => runBookingAction(permittedPrimaryAction)}
                disabled={isUpdating || isStartingJourney || isMarkingArrived}
                className="min-h-[44px] shrink-0 bg-blue-600 hover:bg-blue-700"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {permittedPrimaryAction.label}
              </Button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {actionModel.happyPath.map((label, idx) => (
              <span
                key={label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  idx <= actionModel.activeStepIndex
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {idx + 1}. {label}
              </span>
            ))}
          </div>

          {actionModel.disabledReasons.length > 0 && (
            <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {actionModel.disabledReasons[0]}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            {actionModel.actions
              .filter(
                (action) =>
                  actionAllowedByPermission(action) &&
                  action.id !== permittedPrimaryAction?.id &&
                  action.id !== "cancel" &&
                  action.id !== "mark_no_show",
              )
              .map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  variant="outline"
                  onClick={() => runBookingAction(action)}
                  disabled={isUpdating || isStartingJourney || isMarkingArrived}
                  className="flex-1 min-h-[44px]"
                >
                  {action.label}
                </Button>
              ))}
          </div>
        </div>

        {/* Payment Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {canMarkPaid && (
            <Button
              onClick={() => setShowMarkPaid(true)}
              disabled={isUpdating}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Mark as Paid
            </Button>
          )}
          {showYocoPayButton && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void openYocoCheckout()}
              disabled={isUpdating || preparingYocoSale}
              className="flex-1 min-h-[44px] border-violet-300 text-violet-900 hover:bg-violet-50"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {preparingYocoSale ? "Preparing…" : "Pay with Yoco (terminal)"}
            </Button>
          )}
          {showPaycloudPayButton && (
            <PaycloudCollectButton
              amount={outstanding}
              currency={bookingCurrency}
              context={paycloudCollectContext}
              onClick={openPaycloudCheckout}
              className="flex-1 min-h-[44px] border-slate-300 text-slate-900 hover:bg-slate-50"
              variant="outline"
              size="default"
            />
          )}
          {showPaystackTerminalButton && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void openPaystackTerminalCollection()}
              disabled={isUpdating || preparingPaystackTerminal}
              className="flex-1 min-h-[44px] border-emerald-300 text-emerald-900 hover:bg-emerald-50"
            >
              <Link2 className="w-4 h-4 mr-2" />
              {preparingPaystackTerminal ? "Preparing…" : "Show Paystack Terminal"}
            </Button>
          )}
          {canSendPaymentLink && (
            <Button
              variant="outline"
              onClick={() => {
                if (booking.customer_email) setSendPaymentLinkMethod("email");
                else if (booking.customer_phone) setSendPaymentLinkMethod("sms");
                setShowSendPaymentLink(true);
              }}
              disabled={isUpdating || sendingPaymentLink}
              className="flex-1 min-h-[44px] border-primary text-primary hover:bg-primary/10"
            >
              <Link2 className="w-4 h-4 mr-2" />
              {sendingPaymentLink ? "Sending…" : "Send payment link"}
            </Button>
          )}
          {canRefund && (
            <Button
              variant="outline"
              onClick={() => {
                setRefundAmount(maxRefundable.toFixed(2));
                setRefundReason("");
                // Smart default: online bookings refund to wallet; provider/
                // walk-in bookings (and any without a platform customer) refund
                // in person (cash). No wallet exists for an unlinked customer.
                const isOnline = (booking as any)?.booking_source === "online";
                setRefundMethod(isOnline && booking?.customer_id ? "store_credit" : "cash");
                setShowRefund(true);
              }}
              disabled={isUpdating}
              className="flex-1 min-h-[44px]"
            >
              Issue Refund
            </Button>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {(isActive || isStarted) && (
            <>
              {canEditAppointments && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (booking.scheduled_at) {
                      const dt = new Date(booking.scheduled_at);
                      setRescheduleDate(dt.toISOString().slice(0, 10));
                      setRescheduleTime(dt.toISOString().slice(11, 16));
                    }
                    setShowReschedule(true);
                  }}
                  disabled={isUpdating}
                  className="flex-1 min-h-[44px]"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Reschedule
                </Button>
              )}
              {canCancelAppointments && (
                <Button
                  variant="outline"
                  onClick={() => handleStatusChange("no_show")}
                  disabled={isUpdating}
                  className="flex-1 min-h-[44px] text-amber-700 border-amber-300 hover:bg-amber-50"
                >
                  No Show
                </Button>
              )}
              {canCancelAppointments && (
                <Button
                  variant="destructive"
                  onClick={() => handleStatusChange("cancelled")}
                  disabled={isUpdating}
                  className="flex-1 min-h-[44px]"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>

        {/* Customer notifications — only surface actions that make contextual sense.
            Confirmation / reminder require the booking to be confirmed first;
            showing them while awaiting payment or awaiting provider confirmation
            is misleading (no confirmation email has been sent yet). */}
        {(isConfirmedOrLater || isCancelled || isNoShow) && (
          <div className="rounded-lg border p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Customer Notifications
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                Manually send confirmation, reminder or cancellation emails / push to the customer.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {isConfirmedOrLater && (
                <Button
                  variant="outline"
                  disabled={isNotifying}
                  onClick={() => handleResendNotification("confirmation")}
                  className="flex-1 min-h-[44px]"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Confirmation
                </Button>
              )}
              {isConfirmedOrLater && (
                <Button
                  variant="outline"
                  disabled={isNotifying}
                  onClick={() => handleResendNotification("reminder")}
                  className="flex-1 min-h-[44px]"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Send Reminder
                </Button>
              )}
              {(isCancelled || isNoShow) && (
                <Button
                  variant="outline"
                  disabled={isNotifying}
                  onClick={() => handleSendCancellationNotice()}
                  className="flex-1 min-h-[44px]"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancellation Notice
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Notes / Special Requests</h3>
            {!editingNotes && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNotesText(booking.special_requests ?? "");
                  setEditingNotes(true);
                }}
              >
                Edit
              </Button>
            )}
          </div>
          {editingNotes ? (
            <div>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm min-h-[80px]"
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>
                  {isSavingNotes ? "Saving..." : "Save"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              {booking.special_requests ?? "No notes"}
            </p>
          )}
        </div>

        {/* Reschedule Dialog */}
        {showReschedule && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Reschedule Booking</h3>
              <div>
                <label className="text-sm font-medium mb-1 block">Date</label>
                <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Time</label>
                <Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleReschedule} disabled={isRescheduling} className="flex-1">
                  {isRescheduling ? "Rescheduling..." : "Confirm Reschedule"}
                </Button>
                <Button variant="outline" onClick={() => setShowReschedule(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mark Paid Dialog */}
        {showMarkPaid && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Mark as Paid</h3>
              <p className="text-sm text-gray-600">Outstanding: {formatMoney(outstanding)}</p>
              <div>
                <label className="text-sm font-medium mb-1 block">Payment method</label>
                <div className="flex flex-wrap gap-2">
                  {markPaidPaymentMethods.map((pm) => (
                    <Button
                      key={pm.value}
                      type="button"
                      variant={markPaidMethod === pm.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMarkPaidMethod(pm.value)}
                      className="flex-1 min-w-[7rem] max-w-full text-sm leading-snug h-auto min-h-[2.75rem] py-2 whitespace-normal"
                    >
                      {pm.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => void handleMarkPaid()}
                  disabled={isMarkingPaid}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {isMarkingPaid
                    ? "Processing..."
                    : markPaidMethod === "paycloud_terminal"
                      ? "Charge on card machine"
                      : "Confirm Payment"}
                </Button>
                <Button variant="outline" onClick={() => setShowMarkPaid(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Booking Dialog */}
        {showCancelDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold text-red-700">Cancel Booking</h3>
              <p className="text-sm text-gray-600">
                This action cannot be undone. Please provide a reason for cancellation.
              </p>
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md p-3">
                The client will receive a full refund to their Beautonomi wallet for amounts
                already paid. Your cancellation policy does not apply to cancellations you
                initiate.
              </p>
              <div>
                <label className="text-sm font-medium mb-1 block">Cancellation reason</label>
                <textarea
                  className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Enter the reason for cancellation..."
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  onClick={handleConfirmCancel}
                  disabled={isUpdating}
                  className="flex-1"
                >
                  {isUpdating ? "Cancelling..." : "Confirm Cancellation"}
                </Button>
                <Button variant="outline" onClick={() => { setShowCancelDialog(false); setCancellationReason(""); }} className="flex-1">
                  Back
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* No-show confirmation */}
        {showNoShowDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold text-amber-700">Mark as no-show</h3>
              <p className="text-sm text-gray-600">
                Mark {booking?.customer_name || booking?.customers?.full_name || "this client"} as a
                no-show?
              </p>
              {noShowFeeEnabled && noShowPreviewFee > 0 ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md p-3">
                  A no-show fee of {formatMoney(noShowPreviewFee)} will be retained (capped to the
                  amount paid). Any remainder is refunded to the client&apos;s Beautonomi wallet.
                </p>
              ) : (
                <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-md p-3">
                  No no-show fee is configured — the client will be fully refunded for amounts
                  already paid.
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  onClick={handleConfirmNoShow}
                  disabled={isUpdating}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  {isUpdating ? "Saving..." : "Confirm no-show"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowNoShowDialog(false)}
                  className="flex-1"
                >
                  Back
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Send payment link */}
        {showSendPaymentLink && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Send payment link</h3>
              <p className="text-sm text-gray-600">
                Send a link so the customer can pay online. Outstanding: {formatMoney(outstanding)}
              </p>
              <div>
                <label className="text-sm font-medium mb-1 block">Send via</label>
                <div className="flex flex-wrap gap-2">
                  {SEND_LINK_OPTIONS.map((opt) => {
                    const disabled =
                      (opt.value === "email" && !booking.customer_email) ||
                      (opt.value === "sms" && !booking.customer_phone) ||
                      (opt.value === "both" && (!booking.customer_email || !booking.customer_phone));
                    return (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={sendPaymentLinkMethod === opt.value ? "default" : "outline"}
                        size="sm"
                        disabled={disabled}
                        title={disabled ? "Add customer email/phone on the customer profile" : undefined}
                        onClick={() => setSendPaymentLinkMethod(opt.value)}
                        className="flex-1 min-w-[5rem]"
                      >
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
                {(!booking.customer_email || !booking.customer_phone) && (
                  <p className="text-xs text-amber-700 mt-2">
                    Email and SMS options require the customer&apos;s contact details on file.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleSendPaymentLink}
                  disabled={sendingPaymentLink}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {sendingPaymentLink ? "Sending…" : "Send link"}
                </Button>
                <Button variant="outline" onClick={() => setShowSendPaymentLink(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Paystack Terminal collection */}
        {showPaystackTerminal && paystackTerminalCode && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Paystack Terminal</h3>
              <p className="text-sm text-gray-600">
                Ask the customer to pay the outstanding amount using this Paystack terminal. Paystack generates the transaction reference; once the webhook arrives, allocate the payment from the terminal inbox.
              </p>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Terminal code</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-emerald-950">
                  {paystackTerminalCode}
                </p>
                <p className="mt-2 text-sm text-emerald-800">Expected: {formatMoney(outstanding)}</p>
                {(paystackTerminalQr || paystackTerminalLink) && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    {paystackTerminalQr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={paystackTerminalQr}
                        alt="Paystack Terminal QR code"
                        className="h-40 w-40 rounded-md border border-emerald-200 bg-white object-contain p-1"
                      />
                    ) : paystackTerminalLink ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paystackTerminalLink)}`}
                        alt="Paystack Terminal QR code"
                        className="h-40 w-40 rounded-md border border-emerald-200 bg-white object-contain p-1"
                      />
                    ) : null}
                    <p className="text-xs text-emerald-700">Customer scans to pay</p>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Tell the customer to enter reference
                </p>
                <p className="mt-1 font-mono text-base font-semibold text-amber-950">
                  {paystackTerminalReference}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-amber-800 underline"
                  onClick={async () => {
                    if (!paystackTerminalReference) return;
                    await navigator.clipboard.writeText(paystackTerminalReference);
                    toast.success("Reference copied");
                  }}
                >
                  Copy reference
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={async () => {
                    await navigator.clipboard.writeText(paystackTerminalCode);
                    toast.success("Terminal code copied");
                  }}
                >
                  Copy code
                </Button>
                {paystackTerminalLink && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      await navigator.clipboard.writeText(paystackTerminalLink);
                      toast.success("Payment link copied");
                    }}
                  >
                    Copy link
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPaystackTerminal(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mark additional charge as paid */}
        {chargeMarkPaidId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Mark charge as paid</h3>
              {(() => {
                const c = additionalCharges.find((x) => x.id === chargeMarkPaidId);
                if (!c) {
                  return (
                    <p className="text-sm text-gray-600">Charge not found.</p>
                  );
                }
                return (
                  <>
                    <p className="text-sm text-gray-600">
                      {c.description} · {c.currency} {Number(c.amount).toFixed(2)}
                    </p>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Payment method</label>
                      <div className="flex flex-wrap gap-2">
                        {chargePaymentMethods.map((pm) => (
                          <Button
                            key={pm.value}
                            type="button"
                            variant={chargeMarkPaidMethod === pm.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => setChargeMarkPaidMethod(pm.value)}
                            className="flex-1 min-w-[7rem] max-w-full text-sm leading-snug h-auto min-h-[2.75rem] py-2 whitespace-normal"
                          >
                            {pm.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="flex gap-3">
                <Button
                  onClick={() => void handleChargeMarkPaid()}
                  disabled={markingChargePaid || !additionalCharges.some((x) => x.id === chargeMarkPaidId)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {markingChargePaid
                    ? "Processing…"
                    : chargeMarkPaidMethod === "paycloud_terminal"
                      ? "Charge on card machine"
                      : "Confirm"}
                </Button>
                <Button variant="outline" onClick={() => setChargeMarkPaidId(null)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Refund Dialog */}
        {showRefund && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Issue Refund</h3>
              <p className="text-sm text-gray-600">
                Net paid after refunds: {formatMoney(netPaidAfterRefunds)} · Max refundable:{" "}
                {formatMoney(maxRefundable)}
              </p>
              <div>
                <label className="text-sm font-medium mb-1 block">Refund amount</label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  max={maxRefundable}
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Reason (required)</label>
                <Textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Service issue, customer request"
                  rows={3}
                  className="resize-y min-h-[72px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Refund method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundMethod("cash")}
                    className={`min-h-[44px] rounded-md border px-3 text-sm font-medium transition ${
                      refundMethod === "cash"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    In person (cash)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!booking?.customer_id) {
                        toast.error("This customer has no wallet. Refund in person instead.");
                        return;
                      }
                      setRefundMethod("store_credit");
                    }}
                    disabled={!booking?.customer_id}
                    className={`min-h-[44px] rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      refundMethod === "store_credit"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Wallet credit
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  {refundMethod === "cash"
                    ? "Records the refund as returned to the customer in person. No wallet credit is issued."
                    : "Adds store credit to the customer's wallet for use on a future booking."}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="destructive" onClick={handleRefund} disabled={isRefunding} className="flex-1">
                  {isRefunding ? "Processing..." : "Confirm Refund"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRefund(false);
                    setRefundReason("");
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Post-completion modal: points, post-your-work, rate client, reviews tip (only when booking loaded) */}
        {booking && (
        <Dialog open={showProviderCompletionModal} onOpenChange={(open) => !open && dismissProviderCompletionModal(true)}>
          <DialogContent className="sm:max-w-md" hideClose={false}>
            <DialogHeader>
              <div className="flex justify-center mb-3">
                <div className="rounded-full bg-primary/10 p-4">
                  <Trophy className="h-10 w-10 text-primary" aria-hidden />
                </div>
              </div>
              <DialogTitle className="text-center text-xl">Booking complete</DialogTitle>
              <DialogDescription className="text-center space-y-2">
                {(() => {
                  const raw = booking.provider_points_earned;
                  const pointsNum = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
                  return pointsNum > 0 ? (
                  <span className="block font-medium text-primary">
                    You earned {pointsNum} points. They’ve been added to your balance.
                  </span>
                ) : (
                  <span className="block text-muted-foreground text-sm">
                    You earn points for each completed booking—keep going to unlock badges.
                  </span>
                );
                })()}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
              <div className="flex items-center gap-2 mb-1">
                <Camera className="h-4 w-4 text-primary" aria-hidden />
                <span className="text-sm font-semibold text-gray-900">Show off your work</span>
              </div>
              <p className="text-xs text-gray-600 mb-3 leading-5">
                Post a photo to Explore to reach new clients and grow your portfolio. Earn bonus reward points for
                every post.
              </p>
              <Button
                onClick={() => {
                  dismissProviderCompletionModal(true);
                  const primaryOfferingId = booking.services?.[0]?.offering_id;
                  const primaryServiceName = booking.services?.[0]?.offering_name || "Appointment";
                  const qs = new URLSearchParams({
                    caption: `Fresh ${primaryServiceName} \u2728`,
                    addToGallery: "1",
                    ...(primaryOfferingId ? { offeringId: primaryOfferingId } : {}),
                    ...(bookingId ? { bookingId: String(bookingId) } : {}),
                  }).toString();
                  router.push(`/provider/explore/new?${qs}`);
                }}
                className="w-full"
              >
                <Camera className="h-4 w-4 mr-2" aria-hidden />
                Add a photo of your work
              </Button>
              <p className="text-[11px] text-gray-400 text-center mt-2">
                Make sure your client is happy to be featured.
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center mt-4">
              Your client can leave a review. Reviews help you get more bookings and earn extra points.
            </p>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-col mt-2">
              <Button
                variant="outline"
                onClick={() => {
                  dismissProviderCompletionModal(true);
                  setShowRateCustomerFromModal(true);
                }}
                className="w-full"
              >
                Rate this client
              </Button>
              <Button
                variant="ghost"
                onClick={() => dismissProviderCompletionModal(true)}
                className="w-full"
              >
                Maybe later
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}

        {/* Rate customer modal (opened from completion modal or from button below) */}
        {(booking?.status === "completed" || booking?.status === "no_show") && bookingId && (
          <RateCustomerModal
            open={showRateCustomerFromModal}
            onOpenChange={setShowRateCustomerFromModal}
            bookingId={String(bookingId)}
            customerName={typeof booking.customers?.full_name === "string" ? booking.customers.full_name : "Client"}
            onSuccess={() => setShowRateCustomerFromModal(false)}
          />
        )}

        {bookingId ? (
          <ArrivalQrScanDialog
            open={qrScanDialogOpen}
            onOpenChange={setQrScanDialogOpen}
            onValidScan={(jsonPayload) => submitVerifyQrBody({ qr_data: jsonPayload })}
          />
        ) : null}

        <PayCloudPaymentDialog
          open={showPaycloudPayment}
          onOpenChange={setShowPaycloudPayment}
          amount={paycloudDialogAmount}
          entityType={paycloudEntityType}
          entityId={paycloudEntityId}
          bookingId={bookingId}
          bookingLocationId={(booking as { location_id?: string | null } | null)?.location_id ?? null}
          onSuccess={async () => {
            toast.success(
              paycloudEntityType === "additional_charge"
                ? "Additional charge payment recorded"
                : "Booking payment recorded",
            );
            await Promise.all([loadBooking(), loadAdditionalCharges()]);
          }}
        />
        <YocoPaymentDialog
          open={showYocoPayment}
          onOpenChange={setShowYocoPayment}
          amount={yocoDialogAmount}
          bookingId={bookingId}
          saleId={yocoBookingSaleId ?? undefined}
          bookingLocationId={(booking as { location_id?: string | null } | null)?.location_id ?? null}
          onSuccess={finalizeYocoBookingPayment}
        />
      </div>
    </RoleGuard>
  );
}
