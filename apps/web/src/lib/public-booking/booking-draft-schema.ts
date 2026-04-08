import { z } from "zod";
import type { BookingDraft, ClientInfo } from "@/types/beautonomi";
import { zPublicBookingStaffIdOptional } from "./zod-public-staff-id";

/**
 * One retail product line on a booking (web + mobile may send camelCase or snake_case; JSON numbers may be strings).
 */
export const bookingProductLineSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID").optional(),
    product_id: z.string().uuid("Invalid product ID").optional(),
    productVariantId: z.string().uuid().optional().nullable(),
    product_variant_id: z.string().uuid().optional().nullable(),
    quantity: z.coerce.number().int().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().min(0, "Unit price must be non-negative"),
    totalPrice: z.coerce.number().min(0, "Total price must be non-negative"),
  })
  .superRefine((row, ctx) => {
    if (!(row.productId || row.product_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each product line must include productId or product_id",
        path: ["productId"],
      });
    }
  })
  .transform((row) => ({
    productId: (row.productId ?? row.product_id) as string,
    productVariantId: row.productVariantId ?? row.product_variant_id ?? null,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
  }));

export type BookingProductLine = z.infer<typeof bookingProductLineSchema>;

/**
 * POST /api/public/bookings JSON body (parsed + staff ids normalized for DB in the route).
 */
export const bookingDraftSchema = z.object({
  provider_id: z.string().uuid("Invalid provider ID"),
  services: z
    .array(
      z.object({
        offering_id: z.string().uuid("Invalid offering ID"),
        staff_id: zPublicBookingStaffIdOptional,
      })
    )
    .min(1, "At least one service is required"),
  selected_datetime: z.string().datetime("Invalid datetime format"),
  location_type: z.enum(["at_home", "at_salon"]),
  location_id: z.string().uuid().optional().nullable(),
  address: z
    .object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().optional(),
      country: z.string().min(1),
      postal_code: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      apartment_unit: z.string().optional().nullable(),
      building_name: z.string().optional().nullable(),
      floor_number: z.string().optional().nullable(),
      access_codes: z.record(z.string(), z.string()).optional().nullable(),
      parking_instructions: z.string().optional().nullable(),
      location_landmarks: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  addons: z.array(z.string().uuid("Invalid addon ID")).optional(),
  products: z.array(bookingProductLineSchema).optional(),
  package_id: z.string().uuid().optional().nullable(),
  /** When redeeming a prepaid session row from `customer_package_entitlements` (must match `package_id`). */
  customer_package_entitlement_id: z.string().uuid().optional().nullable(),
  tip_amount: z.number().min(0).optional(),
  travel_fee: z.number().min(0).optional(),
  special_requests: z.string().optional().nullable(),
  house_call_instructions: z.string().optional().nullable(),
  client_info: z.unknown().optional(),
  payment_method: z.enum(["card", "cash", "giftcard"]).optional(),
  payment_method_id: z.string().uuid().optional().nullable(),
  payment_option: z.enum(["deposit", "full"]).optional(),
  save_card: z.boolean().optional(),
  set_as_default: z.boolean().optional(),
  promotion_code: z.string().optional().nullable(),
  gift_card_code: z.string().optional().nullable(),
  membership_plan_id: z.string().uuid().optional().nullable(),
  use_wallet: z.boolean().optional(),
  is_group_booking: z.boolean().optional(),
  group_participants: z
    .array(
      z.object({
        name: z.string(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        service_ids: z.array(z.string().uuid()),
        notes: z.string().optional().nullable(),
      })
    )
    .optional()
    .nullable(),
  hold_id: z.string().uuid().optional().nullable(),
  loyalty_points_used: z.number().int().min(0).optional(),
  reschedule_booking_id: z.string().uuid().optional().nullable(),
  /** Ordered resource UUIDs for offerings that require rooms/equipment (see booking-holds + consume flow). */
  resource_ids: z.array(z.string().uuid("Invalid resource ID")).optional(),
  /** Minutes after service duration for mobile at-home slots; must match `/api/availability` `travelBuffer`. (Calendar also passes `providerId` to that route when staff is "any" — not part of this JSON body.) */
  availability_travel_buffer_minutes: z.coerce.number().int().min(0).max(360).optional(),
  /** When enabled, recurring series is created after payment (Paystack metadata) or immediately if no card redirect. */
  subscribe_recurring: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(["weekly", "biweekly", "monthly"]),
    })
    .optional(),
});

export type PublicBookingValidatedBody = z.infer<typeof bookingDraftSchema>;

/**
 * Maps validated POST /api/public/bookings body to {@link BookingDraft} (defaults for legacy fields).
 */
export function toBookingDraftFromPublicBody(body: PublicBookingValidatedBody): BookingDraft {
  return {
    provider_id: body.provider_id,
    services: body.services,
    location_type: body.location_type,
    location_id: body.location_id ?? undefined,
    address: body.address ? (body.address as BookingDraft["address"]) : undefined,
    selected_datetime: body.selected_datetime,
    guests: [],
    addons: body.addons ?? [],
    products: body.products?.map((p) => ({
      productId: p.productId,
      productVariantId: p.productVariantId ?? undefined,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      totalPrice: p.totalPrice,
    })),
    package_id: body.package_id ?? undefined,
    customer_package_entitlement_id: body.customer_package_entitlement_id ?? undefined,
    tip_amount: body.tip_amount ?? 0,
    travel_fee: body.travel_fee,
    special_requests: body.special_requests ?? undefined,
    house_call_instructions: body.house_call_instructions ?? undefined,
    client_info: body.client_info as ClientInfo | undefined,
    payment_method: body.payment_method,
    payment_option: body.payment_option,
    promotion_code: body.promotion_code ?? undefined,
    gift_card_code: body.gift_card_code ?? undefined,
    use_wallet: body.use_wallet,
    resource_ids: body.resource_ids,
    subscribe_recurring: body.subscribe_recurring,
  };
}
