import type { Appointment, RecurringAppointment, TeamMember } from "@/lib/provider-portal/types";
import type { AppointmentProduct, AppointmentService } from "@/components/appointments/types";
import { providerApi } from "@/lib/provider-portal/api";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import { DEFAULT_APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";
import type { ProviderBookingCreatedSuccessInput } from "@beautonomi/provider-booking";
import {
  resolveCreateBookingCardChargeTotal,
  resolvePostCreateCollectMethod,
  buildCreateBookingRawPayload,
} from "@beautonomi/provider-booking";
import type { CreatePaymentMethod } from "./CreatePaymentSection";
import type { AppointmentKindValue } from "./AppointmentKindSelector";
import type { AtHomeAddressValue } from "./AtHomeAddressSection";
import type { RecurrencePattern } from "./RecurrenceSection";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLikelyUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export type SubmitCreateBookingInput = {
  clientName: string;
  clientId: string;
  notes: string;
  staffId: string;
  teamMembers: TeamMember[];
  date: string;
  startTime: string;
  locationId: string;
  locations: Array<{ id: string; name?: string }>;
  appointmentKind: AppointmentKindValue;
  selectedServices: AppointmentService[];
  selectedProducts: AppointmentProduct[];
  atHomeAddress: AtHomeAddressValue;
  referralSourceId: string;
  selectedPackageId: string | null;
  discountCode: string;
  discountAmount: number;
  discountReason?: string;
  tipAmount?: number;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  recurrenceEndDate: string;
  recurrenceOccurrences?: string;
  paymentMethod: CreatePaymentMethod;
  sendNotification: boolean;
  collectDeposit: boolean;
  depositPercentage?: number;
  intakeResponses: Record<string, Record<string, unknown>>;
  subtotal: number;
  travelFee: number;
  taxAmount: number;
  totalAmount: number;
  duration: number;
};

export type SubmitCreateBookingResult = {
  appointment: Appointment;
  successPayload: ProviderBookingCreatedSuccessInput;
  warnings?: string[];
};

export async function submitCreateBooking(
  input: SubmitCreateBookingInput,
): Promise<SubmitCreateBookingResult> {
  const primary = input.selectedServices[0];
  const appointmentData = buildCreateBookingRawPayload({
    clientName: input.clientName,
    clientId: input.clientId,
    notes: input.notes,
    staffId: input.staffId,
    staffName: input.teamMembers.find((m) => m.id === input.staffId)?.name ?? "",
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.duration,
    primaryServiceId: primary?.serviceId,
    primaryServiceName: primary?.serviceName,
    primaryPrice: primary?.price ?? 0,
    locationId: input.locationId,
    locationName: input.locations.find((l) => l.id === input.locationId)?.name,
    appointmentKind: input.appointmentKind,
    selectedServices: input.selectedServices,
    selectedProducts: input.selectedProducts,
    paymentMethod: input.paymentMethod,
    sendNotification: input.sendNotification,
    collectDeposit: input.collectDeposit,
    depositPercentage: input.depositPercentage,
    referralSourceId: input.referralSourceId,
    selectedPackageId: input.selectedPackageId,
    discountCode: input.discountCode,
    discountAmount: input.discountAmount,
    discountReason: input.discountReason,
    tipAmount: input.tipAmount ?? 0,
    subtotal: input.subtotal,
    taxAmount: input.taxAmount,
    totalAmount: input.totalAmount,
    intakeResponses: input.intakeResponses,
    atHomeAddress: input.appointmentKind === "at_home" ? input.atHomeAddress : undefined,
    defaultStatus: DEFAULT_APPOINTMENT_STATUS,
  }) as Partial<Appointment>;

  const raw = appointmentData as Record<string, unknown>;

  const cardChargeTotal = resolveCreateBookingCardChargeTotal(
    input.paymentMethod,
    input.totalAmount,
    input.collectDeposit,
    input.depositPercentage,
  );

  let created: Appointment;
  let warnings: string[] | undefined;

  if (input.isRecurring && input.clientId.trim() && isLikelyUuid(input.clientId)) {
    const addonPriceSum = (addons?: AppointmentService["addons"]) =>
      addons?.reduce((sum, a) => sum + a.price, 0) || 0;
    const addonDurationSum = (addons?: AppointmentService["addons"]) =>
      addons?.reduce((sum, a) => sum + a.duration, 0) || 0;

    raw.cart_items = [
      ...input.selectedServices.map((s) => ({
        id: s.id,
        type: "service" as const,
        name: s.serviceName,
        quantity: 1,
        unit_price: s.price,
        total: s.price + addonPriceSum(s.addons),
        service_id: s.serviceId,
        staff_id: s.staffId || input.staffId,
        duration_minutes: s.duration + addonDurationSum(s.addons),
      })),
      ...input.selectedProducts.map((p) => ({
        id: p.id,
        type: "product" as const,
        name: p.productName,
        quantity: p.quantity,
        unit_price: p.unitPrice,
        total: p.totalPrice,
        product_id: p.productId,
        product_variant_id: p.productVariantId || null,
      })),
    ];

    raw.recurrence_rule = {
      pattern: input.recurrencePattern,
      interval: input.recurrencePattern === "biweekly" ? 2 : 1,
      end_date: input.recurrenceEndDate || undefined,
      occurrences: (() => {
        const rawCount = input.recurrenceOccurrences?.trim();
        if (!rawCount) return undefined;
        const n = Number(rawCount);
        return Number.isFinite(n) && n > 1 ? Math.floor(n) : undefined;
      })(),
    };

    try {
      const recurring = await providerApi.createRecurringAppointment({
        ...(appointmentData as unknown as Partial<RecurringAppointment>),
        client_id: input.clientId.trim(),
      });
      created = recurring as unknown as Appointment;
      warnings = (recurring as unknown as { _warnings?: string[] })._warnings;
    } catch (recErr) {
      const reason = formatApiErrorMessage(recErr, "Could not create repeating series");
      throw new Error(`${reason}. Try a single booking instead.`);
    }
  } else {
    created = await providerApi.createAppointment(appointmentData as Appointment);
  }

  const successPayload: ProviderBookingCreatedSuccessInput = {
    status: created.status,
    dbStatus: (created as unknown as { db_status?: string }).db_status,
    paymentStatus: created.payment_status,
    clientName: input.clientName,
    date: input.date,
    time: input.startTime,
    bookingNumber: (created as unknown as { booking_number?: string }).booking_number,
    warnings,
    isWalkIn: input.appointmentKind === "walk_in",
    sendNotification: input.sendNotification,
    postCreateCollect: resolvePostCreateCollectMethod(input.paymentMethod, cardChargeTotal),
    cardChargeAmount: cardChargeTotal,
  };

  return { appointment: created, successPayload, warnings };
}
