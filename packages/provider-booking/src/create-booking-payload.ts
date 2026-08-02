import {
  mapCreateBookingProductLines,
  mapCreateBookingServiceLines,
  resolveDepositChargeAmount,
  type RawProductLineInput,
  type RawServiceLineInput,
} from "./map-create-booking-lines";

export function resolveCreateBookingDepositFlags(
  collectDeposit: boolean,
  totalAmount: number,
  depositPercentage = 50,
) {
  if (!collectDeposit || totalAmount <= 0) return {};
  const pct = Number.isFinite(depositPercentage) && depositPercentage > 0 ? depositPercentage : 50;
  return {
    deposit_required: true,
    deposit_percentage: pct,
    payment_option: "deposit" as const,
  };
}

export function resolvePostCreateCollectMethod(
  paymentMethod: string,
  cardChargeTotal: number,
): "paycloud" | "yoco" | "paystack" | null {
  if (cardChargeTotal <= 0) return null;
  if (paymentMethod === "paycloud_terminal") return "paycloud";
  if (paymentMethod === "yoco_pos") return "yoco";
  if (paymentMethod === "paystack_terminal") return "paystack";
  return null;
}

export function resolveCreateBookingCardChargeTotal(
  paymentMethod: string,
  totalAmount: number,
  collectDeposit = false,
  depositPercentage = 50,
): number {
  const isTerminal =
    paymentMethod === "yoco_pos" ||
    paymentMethod === "paycloud_terminal" ||
    paymentMethod === "paystack_terminal";
  if (!isTerminal || totalAmount <= 0) return 0;
  if (collectDeposit) {
    return resolveDepositChargeAmount(totalAmount, true, depositPercentage);
  }
  return totalAmount;
}

export interface CreateBookingServiceLine extends RawServiceLineInput {}

export interface CreateBookingProductLine extends RawProductLineInput {}

export interface CreateBookingAtHomeAddress {
  addressLine1: string;
  addressLine2?: string;
  addressCity: string;
  addressState?: string;
  addressPostalCode: string;
  addressCountry: string;
  addressLatitude?: number | null;
  addressLongitude?: number | null;
  travelFee: number;
  travelPreviewMinutes?: number;
}

export interface BuildCreateBookingPayloadInput {
  clientName: string;
  clientId?: string;
  notes?: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  primaryServiceId?: string;
  primaryServiceName?: string;
  primaryPrice: number;
  locationId?: string;
  locationName?: string;
  appointmentKind: "in_salon" | "walk_in" | "at_home";
  selectedServices: CreateBookingServiceLine[];
  selectedProducts: CreateBookingProductLine[];
  paymentMethod: string;
  sendNotification: boolean;
  collectDeposit: boolean;
  depositPercentage?: number;
  referralSourceId?: string | null;
  selectedPackageId?: string | null;
  discountCode?: string;
  discountAmount: number;
  discountReason?: string;
  tipAmount?: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  intakeResponses?: Record<string, Record<string, unknown>>;
  atHomeAddress?: CreateBookingAtHomeAddress;
  defaultStatus?: string;
}

/** Builds the raw provider create-booking payload (parity-tested against sidebar). */
export function buildCreateBookingRawPayload(input: BuildCreateBookingPayloadInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    client_name: input.clientName.trim(),
    client_id: input.clientId?.trim() || undefined,
    service_id: input.primaryServiceId,
    service_name: input.primaryServiceName,
    team_member_id: input.staffId,
    team_member_name: input.staffName,
    scheduled_date: input.date,
    scheduled_time: input.startTime,
    duration_minutes: input.durationMinutes,
    price: input.primaryPrice,
    status: input.defaultStatus ?? "pending",
    notes: input.notes?.trim() || undefined,
    location_type: input.appointmentKind === "at_home" ? "at_home" : "at_salon",
    location_id: input.locationId || undefined,
    location_name: input.locationName,
    subtotal: input.subtotal,
    discount_amount: input.discountAmount,
    discount_code: input.discountCode || undefined,
    discount_reason: input.discountReason?.trim() || undefined,
    tax_amount: input.taxAmount,
    tip_amount: input.tipAmount ?? 0,
    total_amount: input.totalAmount,
    services: mapCreateBookingServiceLines(input.selectedServices, input.staffId),
    products: mapCreateBookingProductLines(input.selectedProducts),
    booking_source: input.appointmentKind === "walk_in" ? "walk_in" : "provider",
    payment_method: input.paymentMethod,
    send_notification: input.sendNotification,
    referral_source_id: input.referralSourceId || null,
    package_id: input.selectedPackageId || null,
    tax_rate: 0,
    service_fee_percentage: 0,
    service_fee_amount: 0,
  };

  if (input.intakeResponses && Object.keys(input.intakeResponses).length > 0) {
    payload.provider_form_responses = input.intakeResponses;
  }

  Object.assign(
    payload,
    resolveCreateBookingDepositFlags(input.collectDeposit, input.totalAmount, input.depositPercentage),
  );

  if (input.appointmentKind === "at_home" && input.atHomeAddress) {
    const addr = input.atHomeAddress;
    payload.address_line1 = addr.addressLine1;
    payload.address_line2 = addr.addressLine2;
    payload.address_city = addr.addressCity;
    if (addr.addressState?.trim()) payload.address_state = addr.addressState.trim();
    payload.address_postal_code = addr.addressPostalCode;
    payload.address_country = addr.addressCountry;
    payload.travel_fee = addr.travelFee;
    if (addr.addressLatitude != null) payload.address_latitude = addr.addressLatitude;
    if (addr.addressLongitude != null) payload.address_longitude = addr.addressLongitude;
  }

  return payload;
}
