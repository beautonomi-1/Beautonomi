import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import {
  mapStatusToProvider,
  type BookingStatus,
  type ProviderBookingStatus,
} from "@/lib/utils/booking-status";

function sumUnpaidAdditionalCharges(charges: unknown): number {
  if (!Array.isArray(charges)) return 0;
  return charges
    .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
    .reduce((sum: number, charge: any) => sum + Number(charge?.amount ?? 0), 0);
}

function mapStatusFromDatabase(dbStatus: string): string {
  return mapStatusToProvider(dbStatus as BookingStatus);
}

type GroupPaymentRollup = {
  totalAmount: number;
  totalPaid: number;
  totalRefunded: number;
  walletGiftCoverage: number;
  coverage: number;
  balanceDue: number;
  tipAmount: number;
  paymentStatus: string;
  hasRefundStatus: boolean;
};

/**
 * Mirrors the child-booking aggregation in GET /api/provider/bookings (list)
 * so a synthetic `group:` row matches the merged calendar/list shape.
 */
export function aggregateGroupChildPaymentRollup(
  groupId: string,
  children: unknown,
): GroupPaymentRollup {
  const empty: GroupPaymentRollup = {
    totalAmount: 0,
    totalPaid: 0,
    totalRefunded: 0,
    walletGiftCoverage: 0,
    coverage: 0,
    balanceDue: 0,
    tipAmount: 0,
    paymentStatus: "pending",
    hasRefundStatus: false,
  };
  if (!Array.isArray(children)) return empty;

  let acc = { ...empty };
  for (const child of children as any[]) {
    const childGroupId = child?.group_booking_id ?? groupId;
    if (childGroupId !== groupId) continue;
    if (!childGroupId || ["cancelled", "no_show"].includes(String(child?.status ?? ""))) continue;

    const childPaymentStatus = String(child?.payment_status ?? "");
    const paidAfterRefunds = Math.max(0, Number(child?.total_paid ?? 0) - Number(child?.total_refunded ?? 0));
    const walletGiftCoverage = Number(child?.wallet_amount ?? 0) + Number(child?.gift_card_amount ?? 0);
    const childCoverage = Math.max(paidAfterRefunds, walletGiftCoverage);
    const childUnpaidCharges = sumUnpaidAdditionalCharges(child?.additional_charges);
    const childTotal = Number(child?.total_amount ?? 0);
    const childBalanceDue = computeBookingOutstandingDisplay({
      totalAmount: childTotal,
      totalPaid: Number(child?.total_paid ?? 0),
      totalRefunded: Number(child?.total_refunded ?? 0),
      walletAmount: Number(child?.wallet_amount ?? 0),
      giftCardAmount: Number(child?.gift_card_amount ?? 0),
      unpaidAdditionalCharges: childUnpaidCharges,
      paymentStatus: child?.payment_status ?? null,
    });

    acc = {
      totalAmount: acc.totalAmount + childTotal + childUnpaidCharges,
      totalPaid: acc.totalPaid + Number(child?.total_paid ?? 0),
      totalRefunded: acc.totalRefunded + Number(child?.total_refunded ?? 0),
      walletGiftCoverage: acc.walletGiftCoverage + walletGiftCoverage,
      coverage: acc.coverage + childCoverage,
      balanceDue: acc.balanceDue + childBalanceDue,
      tipAmount: acc.tipAmount + Math.max(0, Number(child?.tip_amount ?? 0)),
      paymentStatus: acc.paymentStatus,
      hasRefundStatus:
        acc.hasRefundStatus ||
        childPaymentStatus === "partially_refunded" ||
        childPaymentStatus === "refunded" ||
        Number(child?.total_refunded ?? 0) > 0,
    };
  }
  return acc;
}

export type ProviderLocationSummary = {
  id?: string;
  name?: string;
  address_line1?: string;
  city?: string;
} | null;

/**
 * Builds the same merged `group:${id}` object shape as GET /api/provider/bookings
 * `transformedGroups`, from a group_bookings detail payload (e.g. group-bookings API `data`).
 */
export function buildMergedGroupRowFromGroupDetailApi(
  group: any,
  opts: {
    lastResortCurrency: string;
    staffName: string | null;
    locationRow: ProviderLocationSummary;
  },
) {
  const { lastResortCurrency, staffName, locationRow } = opts;
  const participants = Array.isArray(group.booking_participants) ? group.booking_participants : [];
  const primary = participants.find((p: any) => p.is_primary_contact) ?? participants[0] ?? {};
  const firstParticipantService = participants.find((p: any) => p.service_id || p.service_name) ?? {};
  const serviceId = firstParticipantService.service_id || group.service_id || "";
  const serviceName =
    firstParticipantService.service_name ||
    group.service_name ||
    group.title ||
    "Group booking";
  const participantTotal = participants.reduce((sum: number, p: any) => sum + (Number(p.price) || 0), 0);
  const productRows = Array.isArray(group.products) ? group.products : [];
  const products = productRows.map((p: any, idx: number) => ({
    id: p.id ?? `${group.id}-product-${idx}`,
    product_id: p.product_id ?? p.productId ?? null,
    product_variant_id: p.product_variant_id ?? p.productVariantId ?? null,
    product_variant:
      p.product_variant_id || p.productVariantId
        ? {
            option_values:
              p.product_variant_name || p.productVariantName
                ? { option: p.product_variant_name ?? p.productVariantName }
                : {},
          }
        : null,
    product_name: p.product_name ?? p.productName ?? "Product",
    quantity: Number(p.quantity ?? 1) || 1,
    unit_price: Number(p.unit_price ?? p.unitPrice ?? 0) || 0,
    total_price:
      Number(p.total_price ?? p.totalPrice ?? 0) ||
      (Number(p.unit_price ?? p.unitPrice ?? 0) || 0) * (Number(p.quantity ?? 1) || 1),
  }));
  const productTotal = products.reduce((sum: number, p: any) => sum + (Number(p.total_price) || 0), 0);
  const total = Number(group.total_price ?? 0) || participantTotal + productTotal + (Number(group.travel_fee) || 0);
  const payment = aggregateGroupChildPaymentRollup(String(group.id ?? ""), group.bookings);
  const displayTotal = payment.totalAmount > 0 ? Math.max(total, payment.totalAmount) : total;
  const balanceDue = Math.max(0, payment.totalAmount > 0 ? payment.balanceDue : total - payment.coverage);
  const groupPaymentStatus =
    payment.hasRefundStatus && payment.totalPaid > 0 && payment.totalRefunded >= payment.totalPaid - 0.01
      ? "refunded"
      : payment.hasRefundStatus
        ? "partially_refunded"
        : displayTotal > 0 && balanceDue <= 0
          ? "paid"
          : payment.totalPaid > 0 || payment.walletGiftCoverage > 0
            ? "partially_paid"
            : "pending";

  const rawStatus =
    group.status === "started" ? "in_progress" : group.status === "booked" ? "confirmed" : group.status;

  return {
    id: `group:${group.id}`,
    group_booking_id: group.id,
    booking_number: group.ref_number || group.id,
    customer_id: null,
    version: 0,
    provider_id: group.provider_id,
    status: mapStatusFromDatabase(rawStatus) as ProviderBookingStatus,
    db_status: rawStatus,
    location_type: group.location_type || "at_salon",
    location_id: group.location_id,
    address: group.address_line1
      ? {
          line1: group.address_line1,
          city: group.address_city,
          state: group.address_state,
          country: group.address_country,
          postal_code: group.address_postal_code,
          latitude: group.address_latitude,
          longitude: group.address_longitude,
        }
      : null,
    scheduled_at: group.scheduled_at,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    services: [
      {
        id: serviceId || group.id,
        offering_id: serviceId || null,
        staff_id: group.staff_id || null,
        staff_name: staffName,
        name: serviceName,
        offering_name: serviceName,
        service_name: serviceName,
        duration_minutes: Number(group.duration_minutes) || 60,
        price: participantTotal || total,
        currency: lastResortCurrency,
        scheduled_start_at: group.scheduled_at,
        scheduled_end_at: null,
        guest_name: primary.participant_name || null,
      },
    ],
    products,
    addons: [],
    package_id: group.package_id || null,
    package_name: null,
    subtotal: Math.max(0, displayTotal - (Number(group.travel_fee) || 0)),
    discount_amount: 0,
    discount_code: null,
    discount_reason: null,
    tax_amount: 0,
    tax_rate: 0,
    service_fee_percentage: 0,
    service_fee_amount: 0,
    tip_amount: Math.max(0, Number(payment.tipAmount ?? 0)),
    total_amount: displayTotal,
    total_paid: payment.totalPaid,
    total_refunded: payment.totalRefunded,
    wallet_amount: Math.max(0, payment.walletGiftCoverage),
    gift_card_amount: 0,
    balance_due: balanceDue,
    currency: lastResortCurrency,
    payment_status: groupPaymentStatus,
    outstanding_balance: balanceDue,
    payment_method: null,
    special_requests: group.notes || null,
    loyalty_points_earned: 0,
    travel_fee: Number(group.travel_fee) || 0,
    created_at: group.created_at,
    updated_at: group.updated_at,
    current_stage: null,
    customers: {
      id: null,
      full_name: primary.participant_name || group.title || "Group booking",
      email: primary.participant_email || null,
      phone: primary.participant_phone || null,
    },
    locations: locationRow,
    customer_name: primary.participant_name || group.title || "Group booking",
    location_name: locationRow?.name || null,
    staff_name: staffName,
    is_group_booking: true,
    group_booking_ref: group.ref_number || null,
    provider_form_responses: null,
    booking_source: "group_booking",
  };
}
