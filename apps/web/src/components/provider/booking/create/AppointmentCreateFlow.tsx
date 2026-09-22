"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Appointment, TeamMember, ServiceItem, Salon } from "@/lib/provider-portal/types";
import type { AppointmentService, AppointmentProduct } from "@/components/appointments/types";
import { calculateBookingPricing } from "@/components/appointments/pricing";
import { providerPortalFetch } from "@/lib/http/fetcher";
import { formatApiErrorMessage, subscriptionUpgradeHint } from "@/lib/http/api-error";
import { getUpgradeMessage } from "@/lib/subscriptions/subscription-upgrade-copy";
import {
  mapBookingCreateError,
  PROVIDER_BOOKING_DRAFT_KEY,
  PROVIDER_BOOKING_DRAFT_TTL_MS,
  BOOKING_ERROR_CODES,
  buildSingleBookingCreateReadiness,
  validateProviderBookingCreateDetailed,
  type ProviderBookingCreateValidationInput,
} from "@beautonomi/provider-booking";
import { BookingCreateReadinessStrip } from "../ui/BookingCreateReadinessStrip";
import { useAppointmentSidebar } from "@/stores/appointment-sidebar-store";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingConflictBanner,
  BookingDraftBanner,
  BookingSectionCard,
  BookingSectionLabel,
  BookingSummaryRow,
} from "../ui";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { AppointmentReviewStep } from "./AppointmentReviewStep";
import { AppointmentKindSelector, type AppointmentKindValue } from "./AppointmentKindSelector";
import {
  CreateFormIntakeSection,
  type IntakeFormResponses,
  type ProviderIntakeForm,
} from "./CreateFormIntakeSection";
import { MembershipPreviewPill } from "./MembershipPreviewPill";
import { ResourceRequirementsPreview } from "./ResourceRequirementsPreview";
import { CreatePaymentSection, type CreatePaymentMethod } from "./CreatePaymentSection";
import { ClientSearchPicker } from "./ClientSearchPicker";
import {
  AtHomeAddressSection,
  effectiveAtHomeTravelFee,
  isAtHomeAddressReady,
  type AtHomeAddressValue,
} from "./AtHomeAddressSection";
import { ProviderBookingDateTimePicker } from "./ProviderBookingDateTimePicker";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { ReferralSourceSelect } from "./ReferralSourceSelect";
import { PromoCodeSection } from "./PromoCodeSection";
import { RecurrenceSection, type RecurrencePattern } from "./RecurrenceSection";
import { PackagePickerSection } from "./PackagePickerSection";
import { CreateProductsSection } from "./CreateProductsSection";
import { CreateServicesSection } from "./CreateServicesSection";
import { ServiceAddonsSection } from "./ServiceAddonsSection";
import { NewClientDialog } from "./NewClientDialog";
import { submitCreateBooking } from "./submitCreateBooking";
import { SubscriptionRequiredSheet } from "../scenario/SubscriptionRequiredSheet";
import { PermissionGateInline } from "../scenario/PermissionGateInline";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@beautonomi/i18n";
import { isCustomServicePlaceholderId } from "@/lib/bookings/walk-in-custom-service";

function mapWebIntakeForPackageReadiness(
  forms: ProviderIntakeForm[],
  responses: IntakeFormResponses,
): Pick<ProviderBookingCreateValidationInput, "intakeForms" | "intakeResponses"> {
  const intakeForms = forms.map((form) => ({
    id: form.id,
    title: form.title,
    fields: (form.fields ?? []).map((field) => ({
      id: field.id,
      name: field.name,
      field_type: field.field_type ?? "text",
      is_required: Boolean(field.is_required),
    })),
  }));
  const intakeResponses: ProviderBookingCreateValidationInput["intakeResponses"] = {};
  for (const form of forms) {
    const src = responses[form.id];
    if (!src) continue;
    intakeResponses[form.id] = {};
    for (const field of form.fields ?? []) {
      const raw = src[field.name] ?? src[field.id];
      if (raw === undefined || raw === null) continue;
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        intakeResponses[form.id][field.id] = raw;
      } else {
        intakeResponses[form.id][field.id] = String(raw);
      }
    }
  }
  return { intakeForms, intakeResponses };
}

interface DraftPayload {
  savedAt: number;
  clientName: string;
  notes: string;
  serviceId: string;
  services: AppointmentService[];
}

interface AppointmentCreateFlowProps {
  teamMembers: TeamMember[];
  services: ServiceItem[];
  locations: Salon[];
  onSuccess?: (appointment: Appointment) => void;
  onRefresh?: () => void;
}

export function AppointmentCreateFlow({
  teamMembers,
  services,
  locations,
  onSuccess,
  onRefresh,
}: AppointmentCreateFlowProps) {
  const {
    isOpen,
    draftSlot,
    sendNotification,
    closeSidebar,
    setSaving,
    isSaving,
    createStep,
    setCreateStep,
    openSuccessMode,
    setSendNotification,
  } = useAppointmentSidebar();

  const step = createStep;
  const [appointmentKind, setAppointmentKind] = useState<AppointmentKindValue>("in_salon");
  const [clientId, setClientId] = useState("");
  const [intakeResponses, setIntakeResponses] = useState<IntakeFormResponses>({});
  const [intakeFormsLoaded, setIntakeFormsLoaded] = useState<ProviderIntakeForm[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<CreatePaymentMethod>("pay_later");
  const [collectDeposit, setCollectDeposit] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [locationId, setLocationId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [selectedServices, setSelectedServices] = useState<AppointmentService[]>([]);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);
  const [atHomeAddress, setAtHomeAddress] = useState<AtHomeAddressValue>({
    addressLine1: "",
    addressLine2: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "",
    addressLatitude: null,
    addressLongitude: null,
    travelFee: 0,
    travelPreviewMinutes: null,
    travelPreviewDistanceKm: null,
    useTravelOverride: false,
    travelFeeOverride: null,
  });
  const [selectedProducts, setSelectedProducts] = useState<AppointmentProduct[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [referralSourceId, setReferralSourceId] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [manualDiscountAmount, setManualDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [tipAmount, setTipAmount] = useState(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("weekly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [subscriptionRequiredOpen, setSubscriptionRequiredOpen] = useState(false);
  const [subscriptionGateMessage, setSubscriptionGateMessage] = useState("");
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(50);
  const [taxRate, setTaxRate] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(true);

  useProviderPortal();
  const { format: formatMoney } = useProviderMoneyFormat();
  const { hasPermission, isOwner } = usePermissions();
  const { t } = useTranslation();
  const ac = "web.provider.portal.appointmentCreate";
  const canCreateAppointments = isOwner || hasPermission("create_appointments");

  useEffect(() => {
    let cancelled = false;
    void providerPortalFetch("/api/provider/settings/payments")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json().catch(() => null)) as {
          data?: {
            depositRequired?: boolean;
            deposit_required?: boolean;
            requiresDeposit?: boolean;
            depositPercentage?: number;
            deposit_percentage?: number;
            depositPercent?: number;
            taxInclusive?: boolean;
          };
        } | null;
        const d = body?.data;
        if (!d || cancelled) return;
        const required = Boolean(d.depositRequired ?? d.deposit_required ?? d.requiresDeposit);
        const pct = Number(
          d.depositPercentage ?? d.deposit_percentage ?? d.depositPercent ?? 50,
        );
        setDepositRequired(required);
        setDepositPercentage(Number.isFinite(pct) && pct > 0 ? pct : 50);
        if (required) setCollectDeposit(true);
        if (d.taxInclusive !== undefined) setTaxInclusive(d.taxInclusive);
      })
      .catch(() => {
        /* defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void providerPortalFetch("/api/provider/tax-rate")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json().catch(() => null)) as { data?: { taxRate?: number } } | null;
        const pct = Number(body?.data?.taxRate ?? 0);
        if (!cancelled) setTaxRate(pct / 100);
      })
      .catch(() => {
        /* defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = isOpen && draftSlot != null;

  const resetForm = useCallback(() => {
    setCreateStep("form");
    setClientName("");
    setNotes("");
    setStaffId("");
    setDate("");
    setStartTime("");
    setLocationId("");
    setServiceId("");
    setSelectedServices([]);
    setConflictMessage(null);
    setShowDraftBanner(false);
    setPendingDraft(null);
    setAtHomeAddress({
      addressLine1: "",
      addressLine2: "",
      addressCity: "",
      addressState: "",
      addressPostalCode: "",
      addressCountry: "",
      addressLatitude: null,
      addressLongitude: null,
      travelFee: 0,
      travelPreviewMinutes: null,
      travelPreviewDistanceKm: null,
      useTravelOverride: false,
      travelFeeOverride: null,
    });
    setSelectedProducts([]);
    setSelectedPackageId(null);
    setReferralSourceId("");
    setDiscountCode("");
    setDiscountAmount(0);
    setManualDiscountAmount(0);
    setDiscountReason("");
    setTipAmount(0);
    setIsRecurring(false);
    setRecurrencePattern("weekly");
    setRecurrenceEndDate("");
    setRecurrenceOccurrences("");
  }, [setCreateStep]);

  useEffect(() => {
    if (!open || !draftSlot) return;

    setStaffId(draftSlot.staffId);
    setDate(draftSlot.date);
    setStartTime(draftSlot.startTime);
    setLocationId(draftSlot.locationId ?? locations[0]?.id ?? "");
    setClientName(draftSlot.prefillClientName ?? "");
    setClientId(draftSlot.prefillCustomerId ?? "");
    if (draftSlot.appointmentKind) setAppointmentKind(draftSlot.appointmentKind);
    setConflictMessage(null);
    setCreateStep("form");

    if (draftSlot.prefillServiceId) {
      const svc = services.find((s) => s.id === draftSlot.prefillServiceId);
      if (svc) {
        setServiceId(svc.id);
        setSelectedServices([
          {
            id: `svc-0`,
            serviceId: svc.id,
            serviceName: svc.name,
            duration: svc.duration_minutes,
            price: svc.price,
          },
        ]);
      }
    }

    try {
      const raw = localStorage.getItem(PROVIDER_BOOKING_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as DraftPayload;
        if (Date.now() - draft.savedAt < PROVIDER_BOOKING_DRAFT_TTL_MS) {
          setPendingDraft(draft);
          setShowDraftBanner(true);
        } else {
          localStorage.removeItem(PROVIDER_BOOKING_DRAFT_KEY);
        }
      }
    } catch {
      /* ignore */
    }
  }, [open, draftSlot, locations, services]);

  const saveDraft = useCallback(() => {
    try {
      const payload: DraftPayload = {
        savedAt: Date.now(),
        clientName,
        notes,
        serviceId,
        services: selectedServices,
      };
      localStorage.setItem(PROVIDER_BOOKING_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }, [clientName, notes, serviceId, selectedServices]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(saveDraft, 500);
    return () => clearTimeout(timer);
  }, [open, saveDraft]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(PROVIDER_BOOKING_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    setServiceId(selectedServices[0]?.serviceId ?? "");
  }, [selectedServices]);

  const effectiveDiscountAmount = Math.max(manualDiscountAmount, discountAmount);
  const discountFromManual = manualDiscountAmount >= discountAmount && manualDiscountAmount > 0;
  const discountLabel = discountFromManual
    ? t(`${ac}.manualDiscount`)
    : discountCode.trim()
      ? t(`${ac}.promoDiscount`, { code: discountCode.trim() })
      : selectedPackageId
        ? t(`${ac}.packageDiscount`)
        : t(`${ac}.discount`);

  const totals = useMemo(() => {
    const travelFee =
      appointmentKind === "at_home" ? effectiveAtHomeTravelFee(atHomeAddress) : 0;
    const duration =
      selectedServices.reduce((sum, s) => {
        const addonMin = s.addons?.reduce((a, ad) => a + ad.duration, 0) ?? 0;
        return sum + s.duration + addonMin;
      }, 0) || 60;
    const pricing = calculateBookingPricing(
      selectedServices,
      selectedProducts,
      travelFee,
      effectiveDiscountAmount,
      taxRate,
      0,
      tipAmount,
      { taxInclusive },
    );
    return {
      subtotal: pricing.subtotal,
      travelFee,
      duration,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      discountAmount: effectiveDiscountAmount,
    };
  }, [
    selectedServices,
    selectedProducts,
    appointmentKind,
    atHomeAddress,
    effectiveDiscountAmount,
    tipAmount,
    taxRate,
    taxInclusive,
  ]);

  const atHomeReady = appointmentKind !== "at_home" || isAtHomeAddressReady(atHomeAddress);

  const needsServiceFirstForScheduling =
    selectedServices.length === 0 && selectedProducts.length === 0;

  const slotStaffIds = useMemo(() => {
    const fromLines = selectedServices.map((s) => s.staffId).filter(Boolean) as string[];
    if (fromLines.length > 0) return [...new Set(fromLines)];
    return staffId ? [staffId] : [];
  }, [selectedServices, staffId]);

  const slotServiceIds = useMemo(
    () =>
      [
        ...new Set(
          selectedServices
            .filter((s) => s.serviceId && !isCustomServicePlaceholderId(s.serviceId))
            .map((s) => s.serviceId)
            .filter(Boolean),
        ),
      ],
    [selectedServices],
  );

  const atHomeTravelBufferMinutes = useMemo(() => {
    if (appointmentKind !== "at_home") return 0;
    if (
      atHomeAddress.travelPreviewMinutes != null &&
      Number.isFinite(atHomeAddress.travelPreviewMinutes) &&
      atHomeAddress.travelPreviewMinutes > 0
    ) {
      return Math.ceil(atHomeAddress.travelPreviewMinutes);
    }
    return 30;
  }, [appointmentKind, atHomeAddress.travelPreviewMinutes]);

  const providerBookingCreateInput = useMemo((): ProviderBookingCreateValidationInput => {
    const kind = appointmentKind;
    const { intakeForms, intakeResponses: intakeResponsesForPackage } =
      mapWebIntakeForPackageReadiness(intakeFormsLoaded, intakeResponses);
    const locationType: ProviderBookingCreateValidationInput["locationType"] =
      kind === "at_home" ? "at_home" : kind === "walk_in" ? "walk_in" : "at_salon";
    return {
      clientMode: clientId ? "search" : "new",
      hasSelectedClient: Boolean(clientId && clientName.trim()),
      newClientFirstName: clientName.trim(),
      isWalkIn: kind === "walk_in",
      validatePhone: () => null,
      newClientPhone: "",
      serviceCount: selectedServices.length,
      productCount: selectedProducts.length,
      hasDate: Boolean(date?.trim()),
      hasTime: Boolean(startTime?.trim()),
      isRecurring,
      recurringHasSavedClient: Boolean(clientId.trim()),
      recurringOccurrences: recurrenceOccurrences,
      staffListLength: teamMembers.length,
      allServicesHaveStaff:
        teamMembers.length === 0 ||
        selectedServices.length === 0 ||
        !selectedServices.some((s) => !s.staffId),
      intakeForms,
      intakeResponses: intakeResponsesForPackage,
      locationType,
      addressLine1: atHomeReady ? "ok" : "",
      addressLatitude: atHomeReady ? 0 : null,
      addressLongitude: atHomeReady ? 0 : null,
    };
  }, [
    appointmentKind,
    clientId,
    clientName,
    selectedServices,
    selectedProducts.length,
    date,
    startTime,
    teamMembers.length,
    atHomeReady,
    isRecurring,
    recurrenceOccurrences,
    intakeFormsLoaded,
    intakeResponses,
  ]);

  const createReadiness = useMemo(
    () => buildSingleBookingCreateReadiness(providerBookingCreateInput),
    [providerBookingCreateInput],
  );

  const scrollToBookingSection = useCallback((sectionKey: string) => {
    const el = document.getElementById(`booking-create-section-${sectionKey}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const createValidationError = useMemo(() => {
    const err = validateProviderBookingCreateDetailed(providerBookingCreateInput);
    return err?.message ?? null;
  }, [providerBookingCreateInput]);

  const canContinue = createValidationError == null;

  const handleClose = () => {
    closeSidebar();
    resetForm();
  };

  const handleRestoreDraft = () => {
    if (!pendingDraft) return;
    setClientName(pendingDraft.clientName);
    setNotes(pendingDraft.notes);
    setServiceId(pendingDraft.serviceId);
    setSelectedServices(pendingDraft.services);
    setShowDraftBanner(false);
  };

  const handleGoToReview = async () => {
    if (!canContinue) return;
    setCheckingAvailability(true);
    setConflictMessage(null);
    try {
      const timePart = startTime.length === 5 ? `${startTime}:00` : startTime;
      const scheduledLocal = new Date(`${date}T${timePart}`);
      const params = new URLSearchParams();
      params.set("scheduled_at", scheduledLocal.toISOString());
      params.set("duration_minutes", String(totals.duration));
      if (slotStaffIds.length) params.set("staff_ids", slotStaffIds.join(","));
      else if (staffId) params.set("staff_ids", staffId);
      if (appointmentKind !== "at_home" && locationId) params.set("location_id", locationId);
      const offeringIds = selectedServices
        .map((s) => s.serviceId)
        .filter((id): id is string => Boolean(id) && !isCustomServicePlaceholderId(id));
      if (offeringIds.length) params.set("offering_ids", offeringIds.join(","));
      params.set("mode", appointmentKind === "at_home" ? "mobile" : "salon");
      params.set("travel_buffer", String(atHomeTravelBufferMinutes));

      const res = await providerPortalFetch(`/api/provider/bookings/check-availability?${params}`);
      const body = (await res.json().catch(() => null)) as {
        data?: { available?: boolean; conflicts?: string[] };
      } | null;
      const payload = body?.data;
      if (payload && payload.available === false) {
        const conflicts = payload.conflicts?.join(" ") ?? t(`${ac}.slotUnavailable`);
        setConflictMessage(conflicts);
        return;
      }
      setCreateStep("review");
    } catch {
      setConflictMessage(t(`${ac}.availabilityCheckFailed`));
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleSubmit = async () => {
    if (!canCreateAppointments) {
      toast.error(t(`${ac}.permissionDenied`));
      return;
    }
    if (createValidationError) {
      toast.error(createValidationError);
      return;
    }
    setSaving(true);
    setConflictMessage(null);

    try {
      const { appointment, successPayload, warnings } = await submitCreateBooking({
        t,
        clientName,
        clientId,
        notes,
        staffId: slotStaffIds[0] ?? staffId,
        teamMembers,
        date,
        startTime,
        locationId,
        locations,
        appointmentKind,
        selectedServices,
        selectedProducts,
        atHomeAddress,
        referralSourceId,
        selectedPackageId,
        discountCode: discountFromManual ? "" : discountCode,
        discountAmount: totals.discountAmount,
        discountReason: discountFromManual ? discountReason : undefined,
        tipAmount,
        isRecurring,
        recurrencePattern,
        recurrenceEndDate: recurrenceOccurrences.trim() ? "" : recurrenceEndDate,
        recurrenceOccurrences,
        paymentMethod,
        sendNotification,
        collectDeposit,
        depositPercentage,
        intakeResponses,
        subtotal: totals.subtotal,
        travelFee: totals.travelFee,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        duration: totals.duration,
      });

      if (warnings?.length) {
        toast.warning(warnings.join(" "), { duration: 8000 });
      }

      clearDraft();
      toast.success(isRecurring ? t(`${ac}.seriesCreated`) : t(`${ac}.bookingCreated`));
      onSuccess?.(appointment);
      onRefresh?.();
      openSuccessMode(appointment.id, successPayload);
      resetForm();
    } catch (error) {
      const err = error as { message?: string; code?: string; errorCode?: string };
      const code = err.code ?? err.errorCode;
      if (
        code === BOOKING_ERROR_CODES.SUBSCRIPTION_REQUIRED ||
        code === "LIMIT_REACHED" ||
        code === "SUBSCRIPTION_LIMIT_EXCEEDED" ||
        code === "BOOKING_LIMIT_REACHED"
      ) {
        setSubscriptionGateMessage(
          err.message?.trim() || getUpgradeMessage("limits.bookings"),
        );
        setSubscriptionRequiredOpen(true);
        return;
      }
      const mapped = mapBookingCreateError(
        err.message ?? formatApiErrorMessage(error, t(`${ac}.createFailed`)),
        code,
      );
      setConflictMessage(mapped.message);
      if (mapped.returnToTimePicker) {
        setCreateStep("form");
      }
      toast.error(mapped.message + subscriptionUpgradeHint(error));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      {step === "review" ? (
        <button
          type="button"
          onClick={() => setCreateStep("form")}
          className="p-2 -ms-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={t(`${ac}.back`)}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}
      <h2 className="text-lg font-semibold text-gray-900 flex-1 truncate">
        {step === "review" ? t(`${ac}.reviewBooking`) : t(`${ac}.newBooking`)}
      </h2>
      <button
        type="button"
        onClick={handleClose}
        className="p-2 -me-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={t(`${ac}.close`)}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const footer =
    step === "form" ? (
      <BookingActionButton
        disabled={!canCreateAppointments || !canContinue || checkingAvailability}
        onClick={handleGoToReview}
      >
        {checkingAvailability ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            {t(`${ac}.checking`)}
          </>
        ) : (
          t(`${ac}.reviewBooking`)
        )}
      </BookingActionButton>
    ) : (
      <BookingActionButton
        disabled={!canCreateAppointments || isSaving}
        onClick={handleSubmit}
      >
        {isSaving ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            {t(`${ac}.creating`)}
          </>
        ) : (
          t(`${ac}.confirmBooking`)
        )}
      </BookingActionButton>
    );

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
      mode="create"
      header={header}
      footer={footer}
    >
      <div className="space-y-4 pb-4">
        {!canCreateAppointments ? (
          <PermissionGateInline
            allowed={false}
            message={t(`${ac}.permissionDeniedInline`)}
          />
        ) : null}

        {showDraftBanner && pendingDraft ? (
          <BookingDraftBanner
            onRestore={handleRestoreDraft}
            onDiscard={() => {
              clearDraft();
              setShowDraftBanner(false);
              setPendingDraft(null);
            }}
          />
        ) : null}

        {conflictMessage ? (
          <BookingConflictBanner
            message={conflictMessage}
            onAction={() => {
              setConflictMessage(null);
              setCreateStep("form");
            }}
            onSecondaryAction={
              step === "form"
                ? () => {
                    setConflictMessage(null);
                    setCreateStep("review");
                  }
                : undefined
            }
          />
        ) : null}

        {step === "form" ? (
          <>
          <BookingCreateReadinessStrip
            summary={createReadiness}
            onJumpToSection={scrollToBookingSection}
          />
          {!canContinue && createValidationError ? (
            <p className="mb-3 text-sm text-amber-800" role="alert">
              {createValidationError}
            </p>
          ) : null}
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
            <div className="space-y-4">
            <BookingSectionCard id="booking-create-section-client">
              <BookingSectionLabel className="mb-2">{t(`${ac}.appointmentType`)}</BookingSectionLabel>
              <AppointmentKindSelector value={appointmentKind} onChange={setAppointmentKind} />
            </BookingSectionCard>

            <ClientSearchPicker
              clientName={clientName}
              clientId={clientId}
              onClientNameChange={setClientName}
              onSelectClient={(client) => {
                setClientName(client.full_name);
                setClientId(client.id);
              }}
              onClearClient={() => setClientId("")}
              loadAddressOnSelect={appointmentKind === "at_home"}
              onAddressLoaded={(addr) => setAtHomeAddress((prev) => ({ ...prev, ...addr }))}
            />
            <button
              type="button"
              onClick={() => setNewClientOpen(true)}
              className="text-sm font-semibold text-primary touch-manipulation min-h-[44px] px-1 -mt-2"
            >
              {t(`${ac}.createNewClient`)}
            </button>

            {appointmentKind === "at_home" ? (
              <div id="booking-create-section-location">
                <AtHomeAddressSection value={atHomeAddress} onChange={setAtHomeAddress} />
              </div>
            ) : null}

            {locations.length > 1 ? (
              <BookingSectionCard>
                <BookingSectionLabel className="mb-2">{t(`${ac}.location`)}</BookingSectionLabel>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="rounded-xl min-h-[44px]">
                    <SelectValue placeholder={t(`${ac}.selectLocation`)} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </BookingSectionCard>
            ) : null}

            <div id="booking-create-section-services">
              <CreateServicesSection
                catalog={services}
                services={selectedServices}
                teamMembers={teamMembers}
                defaultStaffId={staffId}
                onChange={setSelectedServices}
              />

              <ServiceAddonsSection services={selectedServices} onChange={setSelectedServices} />
            </div>

            <CreateProductsSection products={selectedProducts} onChange={setSelectedProducts} />

            <BookingSectionCard id="booking-create-section-staff">
              <BookingSectionLabel className="mb-2">{t(`${ac}.defaultStaff`)}</BookingSectionLabel>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="rounded-xl min-h-[44px]">
                  <SelectValue placeholder={t(`${ac}.selectStaff`)} />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {t(`${ac}.defaultStaffHint`)}
              </p>
            </BookingSectionCard>

            <BookingSectionCard id="booking-create-section-schedule">
              <BookingSectionLabel className="mb-2">{t(`${ac}.dateAndTime`)}</BookingSectionLabel>
              <ProviderBookingDateTimePicker
                date={date || new Date().toISOString().split("T")[0]}
                startTime={startTime}
                onDateChange={setDate}
                onTimeChange={setStartTime}
                durationMinutes={totals.duration || 60}
                locationId={locationId || locations[0]?.id || ""}
                serviceIds={slotServiceIds}
                staffIds={slotStaffIds}
                mode={appointmentKind === "at_home" ? "mobile" : "salon"}
                travelBufferMinutes={atHomeTravelBufferMinutes}
                needsServiceFirst={needsServiceFirstForScheduling}
              />
            </BookingSectionCard>

            <PackagePickerSection
              locationId={locationId}
              catalogServices={services}
              selectedPackageId={selectedPackageId}
              onPackageApplied={({ packageId, services: svcLines, products: prodLines }) => {
                setSelectedPackageId(packageId);
                setSelectedServices(svcLines);
                setSelectedProducts(prodLines);
                if (svcLines[0]) setServiceId(svcLines[0].serviceId);
              }}
              onClearPackage={() => {
                setSelectedPackageId(null);
              }}
            />

            <PromoCodeSection
              subtotal={totals.subtotal}
              discountCode={discountCode}
              discountAmount={discountAmount}
              onApplied={(code, amount) => {
                setDiscountCode(code);
                setDiscountAmount(amount);
              }}
              onClear={() => {
                setDiscountCode("");
                setDiscountAmount(0);
              }}
            />

            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">{t(`${ac}.manualDiscount`)}</BookingSectionLabel>
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={t(`${ac}.amountPlaceholder`)}
                    value={manualDiscountAmount > 0 ? String(manualDiscountAmount) : ""}
                    onChange={(e) => setManualDiscountAmount(parseFloat(e.target.value) || 0)}
                    className="rounded-xl min-h-[44px]"
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="text"
                    placeholder={t(`${ac}.reasonOptional`)}
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    className="rounded-xl min-h-[44px]"
                  />
                </div>
              </div>
            </BookingSectionCard>

            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">{t(`${ac}.tip`)}</BookingSectionLabel>
              <div className="flex flex-wrap gap-2">
                {[0, 0.05, 0.1, 0.2].map((pct) => {
                  const tipBase = Math.max(0, totals.subtotal - effectiveDiscountAmount);
                  const tipValue = pct === 0 ? 0 : tipBase * pct;
                  const active = Math.abs(tipAmount - tipValue) < 0.01;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setTipAmount(tipValue)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-xs font-semibold touch-manipulation min-h-[40px]",
                        active
                          ? "bg-gray-900 border-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700",
                      )}
                    >
                      {pct === 0 ? t(`${ac}.tipNone`) : `${Math.round(pct * 100)}%`}
                    </button>
                  );
                })}
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={t(`${ac}.customTip`)}
                value={tipAmount > 0 ? String(tipAmount) : ""}
                onChange={(e) => setTipAmount(parseFloat(e.target.value) || 0)}
                className="rounded-xl min-h-[44px] mt-2"
              />
            </BookingSectionCard>

            <ReferralSourceSelect value={referralSourceId} onChange={setReferralSourceId} />

            <div id="booking-create-section-recurring">
              <RecurrenceSection
                enabled={isRecurring}
                onEnabledChange={setIsRecurring}
                pattern={recurrencePattern}
                onPatternChange={setRecurrencePattern}
                endDate={recurrenceEndDate}
                onEndDateChange={setRecurrenceEndDate}
                occurrenceCount={recurrenceOccurrences}
                onOccurrenceCountChange={setRecurrenceOccurrences}
                hasSavedClient={Boolean(clientId.trim())}
                isWalkIn={appointmentKind === "walk_in"}
              />
            </div>

            <BookingSectionCard>
              <BookingSectionLabel htmlFor="notes" className="mb-2">
                {t(`${ac}.notes`)}
              </BookingSectionLabel>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t(`${ac}.notesPlaceholder`)}
                rows={3}
                className="rounded-xl"
              />
            </BookingSectionCard>

            <MembershipPreviewPill customerId={clientId || undefined} subtotal={totals.subtotal} />

            <BookingSectionCard>
              <BookingSectionLabel className="mb-3">{t(`${ac}.estimate`)}</BookingSectionLabel>
              {totals.duration > 0 ? (
                <BookingSummaryRow label={t(`${ac}.duration`)} value={t(`${ac}.durationMin`, { count: totals.duration })} />
              ) : null}
              <BookingSummaryRow label={t(`${ac}.subtotal`)} value={formatMoney(totals.subtotal)} />
              {totals.travelFee > 0 ? (
                <BookingSummaryRow label={t(`${ac}.travelFee`)} value={formatMoney(totals.travelFee)} />
              ) : null}
              {totals.discountAmount > 0 ? (
                <BookingSummaryRow
                  label={discountLabel}
                  value={`−${formatMoney(totals.discountAmount)}`}
                />
              ) : null}
              {totals.taxAmount > 0 ? (
                <BookingSummaryRow
                  label={
                    taxRate > 0
                      ? taxInclusive
                        ? t(`${ac}.vatIncl`, { rate: (Math.round(taxRate * 10000) / 100).toFixed(1) })
                        : t(`${ac}.taxWithRate`, { rate: (Math.round(taxRate * 10000) / 100).toFixed(1) })
                      : t(`${ac}.tax`)
                  }
                  value={formatMoney(totals.taxAmount)}
                />
              ) : null}
              {tipAmount > 0 ? (
                <BookingSummaryRow label={t(`${ac}.tip`)} value={formatMoney(tipAmount)} />
              ) : null}
              <BookingSummaryRow label={t(`${ac}.total`)} value={formatMoney(totals.totalAmount)} emphasize />
            </BookingSectionCard>
            </div>

            <div className="space-y-4">
            <ResourceRequirementsPreview serviceIds={selectedServices.map((s) => s.serviceId)} />

            <CreateFormIntakeSection
              responses={intakeResponses}
              onChange={setIntakeResponses}
              onFormsLoaded={setIntakeFormsLoaded}
            />

            <CreatePaymentSection
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              collectDeposit={collectDeposit}
              onCollectDepositChange={setCollectDeposit}
              sendNotification={sendNotification}
              onSendNotificationChange={setSendNotification}
              depositPercentage={depositPercentage}
              showDeposit={depositRequired || collectDeposit}
              totalAmount={totals.totalAmount}
            />
            </div>
          </div>
          </>
        ) : (
          <AppointmentReviewStep
            clientName={clientName}
            clientId={clientId || undefined}
            staffId={slotStaffIds[0] ?? staffId}
            teamMembers={teamMembers}
            date={date}
            startTime={startTime}
            services={selectedServices}
            notes={notes}
            totalAmount={totals.totalAmount}
            subtotal={totals.subtotal}
            travelFee={totals.travelFee}
            taxAmount={totals.taxAmount}
            taxRate={taxRate}
            taxInclusive={taxInclusive}
            durationMinutes={totals.duration}
            products={selectedProducts.map((p) => ({
              productName: p.productName,
              totalPrice: p.totalPrice,
            }))}
            locationId={locationId}
            locations={locations}
            appointmentKind={appointmentKind}
            paymentMethod={paymentMethod}
            sendNotification={sendNotification}
            onSendNotificationChange={setSendNotification}
            collectDeposit={collectDeposit}
            depositPercentage={depositPercentage}
            discountAmount={totals.discountAmount}
            discountLabel={discountLabel}
            tipAmount={tipAmount}
            isRecurring={isRecurring}
          />
        )}
      </div>

      <NewClientDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onCreated={(client) => {
          setClientName(client.full_name);
          setClientId(client.id);
        }}
      />

      <SubscriptionRequiredSheet
        open={subscriptionRequiredOpen}
        onOpenChange={setSubscriptionRequiredOpen}
        description={subscriptionGateMessage || getUpgradeMessage("limits.bookings")}
      />
    </BookingBottomSheet>
  );
}
