"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Edit, Loader2, ShieldAlert, X } from "lucide-react";
import { format } from "date-fns";
import type { Appointment } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { useAppointmentSidebar } from "@/stores/appointment-sidebar-store";
import { getBookingNextStepCard, buildBookingCompletionChecklist } from "@beautonomi/provider-booking";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { SafetyPanicButton } from "@/components/safety/SafetyPanicButton";
import CustomerRatingButton from "@/components/reviews/customer-rating-button";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingNextStepCard,
  BookingSectionCard,
  BookingSectionLabel,
  BookingStatusChip,
  BookingSummaryRow,
  BookingCompletionChecklist,
} from "../ui";
import { RescheduleSheet } from "../reschedule/RescheduleSheet";
import { ParticipantRefundSheet } from "../scenario/ParticipantRefundSheet";
import { ProductPickerSheet } from "../commerce/ProductPickerSheet";
import { BookingLiveSyncIndicator } from "./BookingLiveSyncIndicator";
import { BookingPaymentTimeline } from "./BookingPaymentTimeline";
import { ResourceAssignSheet } from "./ResourceAssignSheet";
import { AuditLogSheet } from "./AuditLogSheet";
import { BookingStatusActions } from "./BookingStatusActions";
import { BookingPaymentCollectSection } from "./BookingPaymentCollectSection";
import { BookingAdditionalChargesSection } from "./BookingAdditionalChargesSection";
import { BookingReceiptSection } from "./BookingReceiptSection";
import { BookingRecurringBanner } from "./BookingRecurringBanner";
import { BookingServicesSection } from "./BookingServicesSection";
import { BookingPaymentSummarySection } from "./BookingPaymentSummarySection";
import { useShouldShowCompletionModal } from "./BookingCompletionSuccessDialog";
import { PostCompletionSheet } from "../PostCompletionSheet";
import { BookingCustomOfferBlock } from "./BookingCustomOfferBlock";
import { BookingProductFulfillmentBlock } from "./BookingProductFulfillmentBlock";
import { BookingCustomFieldsBlock } from "./BookingCustomFieldsBlock";
import { BookingFormResponsesSection } from "./BookingFormResponsesSection";
import { BookingAtHomeJourneySection } from "./BookingAtHomeJourneySection";
import { BookingProductsSection } from "./BookingProductsSection";
import { BookingTravelSection } from "./BookingTravelSection";

interface AppointmentViewSheetProps {
  onRefresh?: () => void;
}

export function AppointmentViewSheet({ onRefresh }: AppointmentViewSheetProps) {
  const {
    isOpen,
    mode,
    selectedAppointment,
    selectedAppointmentId,
    closeSidebar,
    switchToEditMode,
    setLoading,
    isLoading,
    updateSelectedAppointment,
    pendingCollectIntent,
    clearPendingCollectIntent,
    subSheet,
    closeSubSheet,
  } = useAppointmentSidebar();

  const { format: formatMoney } = useProviderMoneyFormat();
  const { hasPermission, isOwner } = usePermissions();
  const canEditAppointments = isOwner || hasPermission("edit_appointments");
  const canProcessPayments = isOwner || hasPermission("process_payments");
  const canViewClientRatings =
    isOwner || hasPermission("view_client_ratings") || hasPermission("rate_clients");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectHandledRef = useRef(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [resourceSheetOpen, setResourceSheetOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(selectedAppointment);
  const [autoOpenYoco, setAutoOpenYoco] = useState(false);
  const [autoOpenPaycloud, setAutoOpenPaycloud] = useState(false);
  const [autoOpenPaystack, setAutoOpenPaystack] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);

  const open = isOpen && mode === "view" && !!selectedAppointmentId;

  const loadFullAppointment = useCallback(async () => {
    if (!selectedAppointmentId) return;
    setLoading(true);
    try {
      const full = await providerApi.getAppointment(selectedAppointmentId);
      setAppointment(full);
      updateSelectedAppointment(full);
      setLastUpdatedAt(Date.now());
    } catch {
      setAppointment(selectedAppointment);
    } finally {
      setLoading(false);
    }
  }, [selectedAppointmentId, selectedAppointment, setLoading, updateSelectedAppointment]);

  useEffect(() => {
    if (!open) return;
    setAppointment(selectedAppointment);
    if (selectedAppointmentId) {
      void loadFullAppointment();
    }
  }, [open, selectedAppointmentId, selectedAppointment, loadFullAppointment]);

  const appt = appointment ?? selectedAppointment;
  const raw = appt ? (appt as unknown as Record<string, unknown>) : null;
  const outstanding = appt
    ? computeBookingOutstandingDisplay({
        totalAmount: Number(appt.total_amount ?? appt.price ?? 0),
        totalPaid: Number(raw?.total_paid ?? 0),
        totalRefunded: Number(raw?.total_refunded ?? 0),
        walletAmount: Number(raw?.wallet_amount ?? 0),
        giftCardAmount: Number(raw?.gift_card_amount ?? 0),
        unpaidAdditionalCharges: Number(raw?.unpaid_additional_charges ?? 0),
        paymentStatus: appt.payment_status,
      })
    : 0;

  const totalPaid = Number(raw?.total_paid ?? 0);
  const totalRefunded = Number(raw?.total_refunded ?? 0);
  const maxRefundable = Math.max(0, totalPaid - totalRefunded);
  const overpaidAmount = outstanding < 0 ? Math.abs(outstanding) : 0;

  useEffect(() => {
    if (!open || subSheet !== "refund") return;
    setRefundOpen(true);
    closeSubSheet();
  }, [open, subSheet, closeSubSheet]);

  useEffect(() => {
    if (!open || !appt?.id || outstanding <= 0) return;
    if (!pendingCollectIntent) return;
    if (pendingCollectIntent === "yoco") setAutoOpenYoco(true);
    if (pendingCollectIntent === "paycloud") setAutoOpenPaycloud(true);
    if (pendingCollectIntent === "paystack") setAutoOpenPaystack(true);
    clearPendingCollectIntent();
  }, [open, appt?.id, outstanding, pendingCollectIntent, clearPendingCollectIntent]);

  useEffect(() => {
    if (!open || !appt?.id || collectHandledRef.current) return;
    const collectYoco = searchParams.get("collectYoco");
    const collectPaycloud = searchParams.get("collectPaycloud");
    const collectPaystack = searchParams.get("collectPaystack");
    if (collectYoco !== "1" && collectPaycloud !== "1" && collectPaystack !== "1") return;
    if (outstanding <= 0) return;
    collectHandledRef.current = true;
    if (collectYoco === "1") setAutoOpenYoco(true);
    if (collectPaycloud === "1") setAutoOpenPaycloud(true);
    if (collectPaystack === "1") setAutoOpenPaystack(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("collectYoco");
    params.delete("collectPaycloud");
    params.delete("collectPaystack");
    const qs = params.toString();
    router.replace(qs ? `/provider/bookings?${qs}` : "/provider/bookings", { scroll: false });
  }, [open, appt?.id, outstanding, router, searchParams]);

  const refreshAfterPayment = useCallback(() => {
    onRefresh?.();
    void loadFullAppointment();
  }, [loadFullAppointment, onRefresh]);

  const isAtHome = appt?.location_type === "at_home";
  const isAtSalon = appt?.location_type === "at_salon" || !isAtHome;

  const nextStep = appt
    ? getBookingNextStepCard(
        {
          status: appt.status,
          current_stage: raw?.current_stage as string | undefined,
          arrival_otp_verified: raw?.arrival_otp_verified as boolean | undefined,
          qr_code_verified: raw?.qr_code_verified as boolean | undefined,
        },
        { outstanding, isAtHome, isAtSalon },
      )
    : null;

  const completionChecklist = appt
    ? buildBookingCompletionChecklist({
        status: appt.status,
        paymentStatus: appt.payment_status,
        outstanding,
        unpaidAdditionalCharges: Number(raw?.unpaid_additional_charges ?? 0),
        productOrders: (raw?.product_orders as Array<{ status?: string; fulfillment_type?: string }>) ?? [],
        hasProductsOnBooking: Boolean((raw?.products as unknown[])?.length),
      })
    : null;

  const shouldShowCompletionModal = useShouldShowCompletionModal(appt?.id, appt?.status);

  useEffect(() => {
    if (!open || !appt?.id || appt.status !== "completed") return;
    if (shouldShowCompletionModal) setCompletionModalOpen(true);
  }, [open, appt?.id, appt?.status, shouldShowCompletionModal]);

  const triggerCollectPayment = useCallback(() => {
    if (paycloudEnabled) setAutoOpenPaycloud(true);
    else if (yocoEnabled) setAutoOpenYoco(true);
    else setAutoOpenPaystack(true);
  }, [paycloudEnabled, yocoEnabled]);

  let dateLabel = appt?.scheduled_date ?? "";
  try {
    if (appt?.scheduled_date) {
      dateLabel = format(new Date(`${appt.scheduled_date}T00:00:00`), "EEE, MMM d, yyyy");
    }
  } catch {
    /* keep raw */
  }

  const header = (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 truncate">
          {appt?.client_name ?? "Booking"}
        </h2>
        {appt?.status ? (
          <div className="mt-1">
            <BookingStatusChip status={appt.status} />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={closeSidebar}
        className="p-2 -mr-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const footer = canEditAppointments ? (
    <div className="flex flex-col gap-2 sm:flex-row">
      <BookingActionButton variant="outline" onClick={() => setRescheduleOpen(true)}>
        <CalendarClock className="mr-2 h-4 w-4" />
        Reschedule
      </BookingActionButton>
      <BookingActionButton onClick={switchToEditMode}>
        <Edit className="mr-2 h-4 w-4" />
        Edit
      </BookingActionButton>
    </div>
  ) : undefined;

  return (
    <>
      <BookingBottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) closeSidebar();
        }}
        mode="view"
        header={header}
        footer={appt ? footer : undefined}
      >
        {isLoading && !appt ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : appt ? (
          <div className="space-y-4 pb-4">
            <BookingLiveSyncIndicator lastUpdatedAt={lastUpdatedAt} />

            {nextStep ? (
              <BookingNextStepCard
                title={nextStep.title}
                description={nextStep.description}
                icon={nextStep.icon}
                color={nextStep.color}
              />
            ) : null}

            {completionChecklist && completionChecklist.items.length > 0 ? (
              <BookingCompletionChecklist
                items={completionChecklist.items}
                allDone={completionChecklist.allDone}
                blockingLabels={completionChecklist.blockingLabels}
              />
            ) : null}

            <BookingRecurringBanner appointment={appt} />
            <BookingCustomOfferBlock appointment={appt} />
            <BookingProductFulfillmentBlock bookingId={appt.id} />

            {isAtHome ? (
              <>
                <BookingAtHomeJourneySection
                  bookingId={appt.id}
                  status={appt.status}
                  currentStage={(raw?.current_stage as string | undefined) ?? appt.status}
                  arrivalOtpVerified={raw?.arrival_otp_verified as boolean | undefined}
                  qrCodeVerified={raw?.qr_code_verified as boolean | undefined}
                  arrivalOtpPending={raw?.arrival_otp_pending as boolean | undefined}
                  qrArrivalPending={raw?.qr_arrival_pending as boolean | undefined}
                  onUpdated={refreshAfterPayment}
                />
                <BookingSectionCard>
                  <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    Safety
                  </BookingSectionLabel>
                  <SafetyPanicButton bookingId={appt.id} variant="outline" size="sm" />
                </BookingSectionCard>
              </>
            ) : null}

            {appt ? (
              <BookingStatusActions
                appointment={appt}
                completionChecklist={completionChecklist}
                outstanding={outstanding}
                onCollectPayment={triggerCollectPayment}
                onCompleted={() => setCompletionModalOpen(true)}
                onUpdated={() => {
                  onRefresh?.();
                  void loadFullAppointment();
                }}
              />
            ) : null}

            <BookingServicesSection
              appointment={appt}
              bookingId={appt.id}
              canReassign={canEditAppointments}
              onReassigned={refreshAfterPayment}
            />
            <BookingProductsSection appointment={appt} />
            <BookingTravelSection appointment={appt} />
            <BookingPaymentSummarySection appointment={appt} outstanding={outstanding} />

            <BookingSectionCard>
              <BookingSectionLabel className="mb-3">Schedule</BookingSectionLabel>
              <BookingSummaryRow label="Date" value={dateLabel} />
              <BookingSummaryRow label="Time" value={appt.scheduled_time ?? "—"} />
              <BookingSummaryRow label="Staff" value={appt.team_member_name ?? "—"} />
              {appt.location_type === "at_home" ? (
                <BookingSummaryRow label="Type" value="At home" />
              ) : null}
            </BookingSectionCard>

            {overpaidAmount > 0 && canProcessPayments ? (
              <BookingSectionCard className="border-amber-200 bg-amber-50">
                <p className="text-sm text-amber-950">
                  This booking is overpaid by{" "}
                  <span className="font-semibold">{formatMoney(overpaidAmount)}</span>.
                </p>
                <BookingActionButton
                  className="mt-3"
                  variant="outline"
                  onClick={() => setRefundOpen(true)}
                >
                  Issue refund
                </BookingActionButton>
              </BookingSectionCard>
            ) : null}

            {appt.notes ? (
              <BookingSectionCard>
                <BookingSectionLabel className="mb-2">Notes</BookingSectionLabel>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{appt.notes}</p>
              </BookingSectionCard>
            ) : null}

            <BookingPaymentCollectSection
              appointment={appt}
              onUpdated={refreshAfterPayment}
              initialOpenYoco={autoOpenYoco}
              initialOpenPaycloud={autoOpenPaycloud}
              initialOpenPaystack={autoOpenPaystack}
            />

            <BookingAdditionalChargesSection
              bookingId={appt.id}
              bookingLocationId={appt.location_id ?? null}
              onUpdated={refreshAfterPayment}
            />

            <BookingSectionCard>
              <BookingSectionLabel className="mb-3">Payment</BookingSectionLabel>
              <BookingPaymentTimeline bookingId={appt.id} />
              <div className="flex flex-col gap-2 sm:flex-row mt-3">
                {canProcessPayments ? (
                  <BookingActionButton
                    size="sm"
                    fullWidth={false}
                    variant="outline"
                    onClick={() => setRefundOpen(true)}
                  >
                    Issue refund
                  </BookingActionButton>
                ) : null}
                {canEditAppointments ? (
                  <BookingActionButton
                    size="sm"
                    fullWidth={false}
                    variant="outline"
                    onClick={() => setProductPickerOpen(true)}
                  >
                    Add product
                  </BookingActionButton>
                ) : null}
                {canEditAppointments ? (
                  <BookingActionButton
                    size="sm"
                    fullWidth={false}
                    variant="outline"
                    onClick={() => setResourceSheetOpen(true)}
                  >
                    Resources
                  </BookingActionButton>
                ) : null}
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  onClick={() => setAuditOpen(true)}
                >
                  Audit log
                </BookingActionButton>
              </div>
            </BookingSectionCard>

            <BookingReceiptSection
              bookingId={appt.id}
              clientEmail={(raw?.customer_email as string | undefined) ?? appt.client_email}
            />

            <BookingCustomFieldsBlock
              values={
                (raw?.custom_field_values as Record<string, unknown> | undefined) ??
                (appt as unknown as { custom_field_values?: Record<string, unknown> }).custom_field_values
              }
            />

            <BookingFormResponsesSection
              bookingId={appt.id}
              responses={
                (raw?.provider_form_responses as Record<string, Record<string, unknown>> | undefined) ??
                undefined
              }
              onUpdated={refreshAfterPayment}
            />

            {(appt.status === "completed" || appt.status === "no_show") && appt.id && canViewClientRatings ? (
              <div id="booking-client-rating">
              <BookingSectionCard>
                <BookingSectionLabel className="mb-2">Client rating</BookingSectionLabel>
                <CustomerRatingButton
                  bookingId={String(appt.id)}
                  customerId={String(raw?.customer_id ?? appt.client_id ?? "")}
                  customerName={appt.client_name ?? "Guest"}
                  bookingStatus={appt.status}
                  onRatingSubmitted={refreshAfterPayment}
                />
              </BookingSectionCard>
              </div>
            ) : null}

            {isAtHome ? null : (
              <BookingSectionCard>
                <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" />
                  Safety
                </BookingSectionLabel>
                <SafetyPanicButton bookingId={appt.id} variant="outline" size="sm" />
              </BookingSectionCard>
            )}
          </div>
        ) : null}
      </BookingBottomSheet>

      {appt ? (
        <>
          <RescheduleSheet
            open={rescheduleOpen}
            onOpenChange={setRescheduleOpen}
            appointment={appt}
            onSuccess={() => {
              onRefresh?.();
              void loadFullAppointment();
            }}
          />
          <ParticipantRefundSheet
            open={refundOpen}
            onOpenChange={setRefundOpen}
            bookingId={appt.id}
            participantName={appt.client_name}
            maxAmount={overpaidAmount > 0 ? overpaidAmount : maxRefundable}
            onSuccess={() => {
              onRefresh?.();
              void loadFullAppointment();
            }}
          />
          <ProductPickerSheet
            open={productPickerOpen}
            onOpenChange={setProductPickerOpen}
            onAdd={async (productId, quantity) => {
              const existing =
                ((raw?.products as Array<Record<string, unknown>>) ??
                  (raw?.booking_products as Array<Record<string, unknown>>) ??
                  []) as Array<Record<string, unknown>>;
              const res = await providerApi.listProducts(undefined, { page: 1, limit: 200 });
              const catalog = res.data.find((p) => p.id === productId);
              const unitPrice = Number(catalog?.retail_price ?? 0);
              const nextLine = {
                productId,
                product_id: productId,
                productName: catalog?.name ?? "Product",
                product_name: catalog?.name ?? "Product",
                quantity,
                unitPrice,
                unit_price: unitPrice,
                totalPrice: unitPrice * quantity,
                total_price: unitPrice * quantity,
              };
              const mappedExisting = existing.map((p) => ({
                productId: String(p.productId ?? p.product_id ?? ""),
                productName: String(p.productName ?? p.product_name ?? "Product"),
                quantity: Number(p.quantity ?? 1),
                unitPrice: Number(p.unitPrice ?? p.unit_price ?? 0),
                totalPrice: Number(p.totalPrice ?? p.total_price ?? 0),
                productVariantId: (p.productVariantId ?? p.product_variant_id) as string | null,
              }));
              await providerApi.updateAppointment(appt.id, {
                products: [...mappedExisting, nextLine],
                version: typeof raw?.version === "number" ? raw.version : undefined,
              } as Partial<Appointment>);
              void loadFullAppointment();
              onRefresh?.();
            }}
          />
          <ResourceAssignSheet
            open={resourceSheetOpen}
            onOpenChange={setResourceSheetOpen}
            bookingId={appt.id}
            onSuccess={() => void loadFullAppointment()}
          />
          <AuditLogSheet open={auditOpen} onOpenChange={setAuditOpen} bookingId={appt.id} />
          <PostCompletionSheet
            open={completionModalOpen}
            bookingId={appt.id}
            primaryServiceName={appt.service_name || "Appointment"}
            primaryOfferingId={appt.service_id}
            customerName={appt.client_name ?? "Client"}
            onDismiss={() => setCompletionModalOpen(false)}
          />
        </>
      ) : null}
    </>
  );
}
