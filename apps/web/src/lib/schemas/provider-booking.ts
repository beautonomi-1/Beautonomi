import { z } from "zod";

/**
 * Shared Zod schema for provider-created bookings.
 * Used by POST /api/provider/bookings and the mobile provider app.
 *
 * Accepts both camelCase (mobile) and snake_case (web) field names.
 */

export const providerBookingServiceSchema = z.object({
  service_id: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  offering_id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional().nullable(),
  staffId: z.string().uuid().optional().nullable(),
  add_on_ids: z.array(z.string().uuid()).optional(),
  addOnIds: z.array(z.string().uuid()).optional(),
  price: z.coerce.number().min(0).optional(),
  duration_minutes: z.coerce.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  customization: z.string().max(500).optional().nullable(),
}).transform((s) => ({
  offering_id: s.offering_id ?? s.service_id ?? s.serviceId ?? "",
  staff_id: s.staff_id ?? s.staffId ?? null,
  add_on_ids: s.add_on_ids ?? s.addOnIds ?? [],
  price: s.price ?? 0,
  duration_minutes: s.duration_minutes ?? 60,
  currency: s.currency ?? undefined,
  customization: s.customization ?? null,
}));

export const providerBookingProductSchema = z.object({
  productId: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  productVariantId: z.string().uuid().optional().nullable(),
  product_variant_id: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
  totalPrice: z.coerce.number().min(0),
}).transform((p) => ({
  product_id: p.productId ?? p.product_id ?? "",
  product_variant_id: p.productVariantId ?? p.product_variant_id ?? null,
  quantity: p.quantity,
  unit_price: p.unitPrice,
  total_price: p.totalPrice,
}));

export const providerBookingSchema = z.object({
  // Client identification (one of these groups is required)
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  customer_email: z.string().email().optional(),

  // Schedule
  scheduled_at: z.string().min(1, "Scheduled time is required"),

  // Services (at least one service or product required)
  services: z.array(providerBookingServiceSchema).optional().default([]),
  products: z.array(providerBookingProductSchema).optional().default([]),

  // Location
  location_type: z.enum(["at_salon", "at_home"]).optional().default("at_salon"),
  location_id: z.string().uuid().optional().nullable(),

  // Address (for at_home)
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  address_city: z.string().optional(),
  address_state: z.string().optional(),
  address_postal_code: z.string().optional(),
  address_country: z.string().optional(),
  address_latitude: z.number().optional().nullable(),
  address_longitude: z.number().optional().nullable(),

  // Pricing
  subtotal: z.coerce.number().min(0).optional(),
  discount_amount: z.coerce.number().min(0).optional(),
  discount_code: z.string().optional(),
  discount_reason: z.string().optional(),
  tax_amount: z.coerce.number().min(0).optional(),
  tax_rate: z.coerce.number().min(0).optional(),
  total_amount: z.coerce.number().min(0).optional(),
  tip_amount: z.coerce.number().min(0).optional(),
  travel_fee: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),

  // Payment
  payment_method: z.enum(["cash", "card", "online"]).optional().default("card"),
  payment_option: z.enum(["full", "deposit"]).optional().default("full"),
  deposit_required: z.boolean().optional(),
  deposit_percentage: z.coerce.number().min(0).max(100).optional(),
  deposit_amount: z.coerce.number().min(0).optional(),

  // Booking metadata
  status: z.string().optional(),
  booking_source: z.string().optional(),
  special_requests: z.string().optional().nullable(),
  send_notification: z.boolean().optional().default(true),
  referral_source_id: z.string().uuid().optional(),
  package_id: z.string().uuid().optional().nullable(),
}).refine(
  (data) => (data.services?.length ?? 0) > 0 || (data.products?.length ?? 0) > 0,
  { message: "At least one service or product is required", path: ["services"] },
);

export type ProviderBookingInput = z.infer<typeof providerBookingSchema>;

/**
 * Shared schema for notification preference updates.
 */
const channelPrefsSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  push: z.boolean().optional(),
});

export const notificationPreferencesSchema = z.object({
  booking_updates: channelPrefsSchema.optional(),
  booking_cancellations: channelPrefsSchema.optional(),
  booking_reminders: channelPrefsSchema.optional(),
  new_reviews: channelPrefsSchema.optional(),
  review_responses: channelPrefsSchema.optional(),
  client_messages: channelPrefsSchema.optional(),
  payment_received: channelPrefsSchema.optional(),
  payout_updates: channelPrefsSchema.optional(),
  waitlist_notifications: channelPrefsSchema.optional(),
  system_updates: channelPrefsSchema.optional(),
  marketing: channelPrefsSchema.optional(),
  booking_alert_sound: z.boolean().optional(),
  order_alert_sound: z.boolean().optional(),
  message_alert_sound: z.boolean().optional(),
  unsubscribe_marketing: z.boolean().optional(),
  quiet_hours_enabled: z.boolean().optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  digest_mode: z.enum(["none", "daily", "weekly"]).optional(),
}).passthrough();

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

/**
 * Shared schema for calendar preference updates.
 */
export const calendarPreferencesSchema = z.object({
  highContrast: z.boolean().optional(),
  showCanceled: z.boolean().optional(),
  compactMode: z.boolean().optional(),
  showAppointmentIcons: z.boolean().optional(),
  showPrices: z.boolean().optional(),
  showClientPhone: z.boolean().optional(),
  colorBy: z.enum(["status", "service", "team_member"]).optional(),
  timeIncrementMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]).optional(),
  scrollToNow: z.boolean().optional(),
  workdayStartHour: z.number().int().min(0).max(23).optional(),
  workdayEndHour: z.number().int().min(0).max(23).optional(),
  showProcessingAndBuffer: z.boolean().optional(),
  defaultNewAppointmentStatus: z.enum(["confirmed", "unconfirmed"]).optional(),
  processingFreesProvider: z.boolean().optional(),
});

export type CalendarPreferencesInput = z.infer<typeof calendarPreferencesSchema>;
