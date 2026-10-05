import { computeCatalogPackageServiceDiscount } from "@beautonomi/utils";

export type BookingTotalsLineItem = {
  servicesTotal: number;
  addonsTotal: number;
  productsTotal: number;
  travelFee: number;
  packageDiscount: number;
  subtotalBeforeDiscounts: number;
  couponDiscount: number;
  membershipDiscount: number;
  loyaltyDiscount: number;
  discounts: number;
  subtotalAfterDiscounts: number;
  taxAmount: number;
  serviceFeeAmount: number;
  tipAmount: number;
  total: number;
  currency: string;
};

type ServiceLine = { id: string; price: number; currency?: string };
type Participant = { serviceIds: string[] };

export type ComputeBookingTotalsInput = {
  selectedServices: ServiceLine[];
  selectedAddons: Array<{ price: number }>;
  selectedProducts: Array<{ price: number; quantity: number }>;
  travelFee?: number;
  isGroupBooking?: boolean;
  groupParticipants?: Participant[];
  selectedPackage?: { price: number; discount: number } | null;
  couponDiscount?: number;
  membershipDiscount?: number;
  loyaltyDiscount?: number;
  taxAmount?: number;
  /** When true, tax is extracted from prices — do not add `taxAmount` to payable total (matches validate-booking). */
  taxIncluded?: boolean;
  serviceFeeAmount?: number;
  tipAmount?: number;
  defaultCurrency: string;
};

/** Payable total after discounts — mirrors `validate-booking.ts` sumMoney composition. */
export function computeBookingPayableTotal(params: {
  subtotalAfterDiscounts: number;
  taxAmount?: number;
  taxIncluded?: boolean;
  serviceFeeAmount?: number;
  tipAmount?: number;
}): number {
  const {
    subtotalAfterDiscounts,
    taxAmount = 0,
    taxIncluded = false,
    serviceFeeAmount = 0,
    tipAmount = 0,
  } = params;
  if (taxIncluded) {
    return subtotalAfterDiscounts + serviceFeeAmount + tipAmount;
  }
  return subtotalAfterDiscounts + taxAmount + serviceFeeAmount + tipAmount;
}

export function computeBookingTotals(input: ComputeBookingTotalsInput): BookingTotalsLineItem {
  const {
    selectedServices,
    selectedAddons,
    selectedProducts,
    travelFee = 0,
    isGroupBooking,
    groupParticipants,
    selectedPackage,
    couponDiscount = 0,
    membershipDiscount = 0,
    loyaltyDiscount = 0,
    taxAmount = 0,
    taxIncluded = false,
    serviceFeeAmount = 0,
    tipAmount = 0,
    defaultCurrency,
  } = input;

  let servicesTotal = 0;
  if (isGroupBooking && groupParticipants?.length) {
    servicesTotal = groupParticipants.reduce((total, participant) => {
      const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
        const service = selectedServices.find((s) => s.id === serviceId);
        return sum + (service?.price || 0);
      }, 0);
      return total + participantTotal;
    }, 0);
  } else {
    servicesTotal = selectedServices.reduce((sum, s) => sum + s.price, 0);
  }

  const packageDiscount = selectedPackage
    ? computeCatalogPackageServiceDiscount(
        {
          price: selectedPackage.price,
          discount_percentage: selectedPackage.discount,
        },
        servicesTotal,
      )
    : 0;

  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const productsTotal = selectedProducts.reduce(
    (sum, p) => sum + p.price * p.quantity,
    0,
  );

  const subtotalBeforeDiscounts =
    Math.max(0, servicesTotal - packageDiscount) + addonsTotal + productsTotal + travelFee;

  const discounts = couponDiscount + membershipDiscount + loyaltyDiscount;
  const subtotalAfterDiscounts = Math.max(0, subtotalBeforeDiscounts - discounts);
  const total = computeBookingPayableTotal({
    subtotalAfterDiscounts,
    taxAmount,
    taxIncluded,
    serviceFeeAmount,
    tipAmount,
  });
  const currency = selectedServices[0]?.currency || defaultCurrency;

  return {
    servicesTotal,
    addonsTotal,
    productsTotal,
    travelFee,
    packageDiscount,
    subtotalBeforeDiscounts,
    couponDiscount,
    membershipDiscount,
    loyaltyDiscount,
    discounts,
    subtotalAfterDiscounts,
    taxAmount,
    serviceFeeAmount,
    tipAmount,
    total,
    currency,
  };
}
