import type { Appointment, TeamMember, ServiceItem, ProductItem, Salon } from "@/lib/provider-portal/types";
import { AppointmentKind } from "@/lib/scheduling/mangomintAdapter";

export interface AppointmentSidebarProps {
  teamMembers: TeamMember[];
  services: ServiceItem[];
  products?: ProductItem[];
  locations: Salon[];
  onAppointmentCreated?: (appointment: Appointment) => void;
  onAppointmentUpdated?: (appointment: Appointment) => void;
  onAppointmentDeleted?: (appointmentId: string) => void;
  onRefresh?: () => void;
}

export interface AppointmentService {
  id: string;
  serviceId: string;
  serviceName: string;
  duration: number;
  price: number;
  customization?: string;
  addons?: Array<{
    id: string;
    addonId: string;
    addonName: string;
    price: number;
    duration: number;
  }>;
  variantId?: string;
  variantName?: string;
}

export interface AppointmentProduct {
  id: string;
  productId: string;
  productName: string;
  productVariantId?: string | null;
  productVariantName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CreateFormData {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  kind: AppointmentKind;
  locationId: string;
  staffId: string;
  date: string;
  startTime: string;
  duration: number;
  serviceId: string;
  serviceName: string;
  price: number;
  services: AppointmentService[];
  products: AppointmentProduct[];
  notes: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  discountCode?: string;
  discountReason?: string;
  taxAmount: number;
  taxRate: number;
  serviceFeePercentage: number;
  serviceFeeAmount: number;
  tipAmount: number;
  walletAmount: number;
  giftCardAmount: number;
  loyaltyDiscountAmount: number;
  promotionDiscountAmount: number;
  membershipDiscountAmount: number;
  totalAmount: number;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressPostalCode: string;
  addressCountry: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
  travelFee: number;
  travelTimeOverride: number | null;
  travelFeeOverride: number | null;
  travelOverrideReason: string;
  hasTravelOverride: boolean;
  referralSourceId: string;
  clientId: string;
  isRecurring: boolean;
  recurrencePattern: "daily" | "weekly" | "biweekly" | "monthly";
  recurrenceEndDate: string;
  paymentMethod: "pay_later" | "cash" | "card" | "yoco_pos" | "payment_link";
}

export type CancelReason = "normal" | "late_cancel" | "no_show";

export interface PricingResult {
  subtotal: number;
  afterDiscount: number;
  taxAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
}
