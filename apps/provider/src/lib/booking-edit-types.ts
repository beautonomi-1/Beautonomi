export interface BookingEditServiceLine {
  serviceId: string;
  staffId?: string;
  addOnIds?: string[];
  customization?: string;
  /** Snapshot from booking line when catalog lookup misses (e.g. inactive custom-offer offering). */
  offeringName?: string;
  price?: number;
  durationMinutes?: number;
}

export interface BookingEditProductLine {
  productId: string;
  productName: string;
  productVariantId?: string;
  productVariantName?: string;
  quantity: number;
  unitPrice: number;
}

export interface BookingEditCatalogService {
  id: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
  add_ons?: { id: string; name: string; price: number; duration_minutes: number }[];
}

export interface BookingEditTotalsInput {
  subtotal: number;
  manualDiscount: number;
  preservedDiscountTotal: number;
  taxRate: number;
  taxInclusive: boolean;
  travelFee: number;
  tipAmount: number;
  serviceFeeAmount: number;
}

export interface BookingEditPatchPayload {
  services: Array<{
    serviceId: string;
    staff_id?: string;
    offering_id: string;
    price: number;
    duration: number;
    scheduled_start_at?: string;
  }>;
  products: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    productVariantId?: string | null;
  }>;
  staff_id?: string;
  special_requests?: string;
  subtotal: number;
  discount_amount: number;
  discount_reason?: string;
  tax_amount: number;
  tax_rate: number;
  total_amount: number;
  version?: number;
}
