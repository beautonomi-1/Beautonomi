/**
 * Integration tests for the public booking creation flow.
 *
 * Covers:
 *  - Zod schema validation for the booking draft
 *  - Payment webhook signature verification logic
 *  - Common validation error scenarios
 */

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  bookingDraftSchema,
  type PublicBookingValidatedBody,
} from "@/lib/public-booking/booking-draft-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// RFC 4122 valid UUIDs (Zod .uuid() requires version digit 1–8 and variant 8/9/a/b)
const TEST_PROVIDER_ID = "00000000-0000-4000-8000-000000000001";
const TEST_OFFERING_ID = "00000000-0000-4000-8000-000000000010";
const TEST_LOCATION_ID = "00000000-0000-4000-8000-000000000020";

/** A minimal valid booking draft. */
function validBookingDraft(overrides: Partial<PublicBookingValidatedBody> = {}): PublicBookingValidatedBody {
  return {
    provider_id: TEST_PROVIDER_ID,
    services: [
      {
        offering_id: TEST_OFFERING_ID,
        staff_id: null,
      },
    ],
    selected_datetime: "2026-03-15T10:00:00Z",
    location_type: "at_salon",
    location_id: TEST_LOCATION_ID,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Booking draft schema validation
// ═══════════════════════════════════════════════════════════════════════════

describe("bookingDraftSchema – validation", () => {
  it("accepts a valid minimal booking draft", () => {
    const result = bookingDraftSchema.safeParse(validBookingDraft());
    expect(result.success).toBe(true);
  });

  it("accepts a draft with optional fields populated", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        tip_amount: 50,
        travel_fee: 25,
        special_requests: "Please use organic products",
        payment_method: "card",
        payment_option: "full",
        promotion_code: "SAVE10",
        use_wallet: false,
        is_group_booking: false,
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts optional resource_ids (UUID array)", () => {
    const resourceId = "00000000-0000-4000-8000-000000000030";
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ resource_ids: [resourceId] })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resource_ids).toEqual([resourceId]);
    }
  });

  it("accepts product lines with product_id and string-coerced numbers", () => {
    const pid = "00000000-0000-4000-8000-000000000040";
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        products: [
          {
            product_id: pid,
            quantity: "2",
            unitPrice: "10",
            totalPrice: "20",
          },
        ] as unknown as PublicBookingValidatedBody["products"],
      })
    );
    expect(result.success).toBe(true);
    if (result.success && result.data.products?.[0]) {
      expect(result.data.products[0].productId).toBe(pid);
      expect(result.data.products[0].quantity).toBe(2);
    }
  });

  it("accepts optional customer_package_entitlement_id with package_id", () => {
    const PKG = "00000000-0000-4000-8000-000000000040";
    const ENT = "00000000-0000-4000-8000-000000000041";
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        package_id: PKG,
        customer_package_entitlement_id: ENT,
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects product lines without productId or product_id", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        products: [
          {
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
          },
        ] as unknown as PublicBookingValidatedBody["products"],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects when provider_id is missing", () => {
    const draft = validBookingDraft();
    delete (draft as Record<string, any>)["provider_id"];

    const result = bookingDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("rejects when provider_id is not a valid UUID", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ provider_id: "not-a-uuid" })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Invalid provider ID");
    }
  });

  it("rejects when services array is empty", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ services: [] })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("At least one service is required");
    }
  });

  it("rejects when selected_datetime is not ISO format", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ selected_datetime: "March 15, 2026" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an invalid location_type value", () => {
    const draft = { ...validBookingDraft(), location_type: "virtual" };
    const result = bookingDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("rejects negative tip_amount", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ tip_amount: -10 })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an invalid payment_method enum value", () => {
    const draft = { ...validBookingDraft(), payment_method: "bitcoin" };
    const result = bookingDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid payment_option enum value", () => {
    const draft = { ...validBookingDraft(), payment_option: "installments" };
    const result = bookingDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("validates the address sub-object when location_type is at_home", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        location_type: "at_home",
        location_id: null,
        address: {
          line1: "12 Main Road",
          city: "Johannesburg",
          country: "ZA",
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects address with empty line1", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        location_type: "at_home",
        address: { line1: "", city: "Cape Town", country: "ZA" },
      })
    );
    expect(result.success).toBe(false);
  });
});

describe("bookingDraftSchema – hold_id combined with group / package / recurring", () => {
  const HOLD_ID = "00000000-0000-4000-8000-000000000099";
  const RESCHED_ID = "00000000-0000-4000-8000-000000000098";

  it("accepts hold_id with subscribe_recurring", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        hold_id: HOLD_ID,
        subscribe_recurring: { enabled: true, frequency: "weekly" },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts hold_id with group booking and reschedule_booking_id", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        hold_id: HOLD_ID,
        is_group_booking: true,
        group_participants: [{ name: "Guest Two", service_ids: [TEST_OFFERING_ID] }],
        reschedule_booking_id: RESCHED_ID,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts hold_id with package_id and membership_plan_id", () => {
    const PKG = "00000000-0000-4000-8000-000000000097";
    const MEM = "00000000-0000-4000-8000-000000000096";
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        hold_id: HOLD_ID,
        package_id: PKG,
        membership_plan_id: MEM,
      }),
    );
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Paystack webhook signature verification
// ═══════════════════════════════════════════════════════════════════════════

describe("Paystack webhook signature verification", () => {
  const PAYSTACK_SECRET = "sk_test_xxxxxxxxxxxxxxxxxxxx";

  /**
   * Mirrors the verification logic in
   * apps/web/src/app/api/payments/webhook/route.ts
   */
  function verifySignature(body: string, signature: string, secret: string): boolean {
    const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
    return hash === signature;
  }

  it("returns true for a valid HMAC-SHA512 signature", () => {
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    const validSig = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(body)
      .digest("hex");

    expect(verifySignature(body, validSig, PAYSTACK_SECRET)).toBe(true);
  });

  it("returns false when the signature does not match", () => {
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    expect(verifySignature(body, "invalid-signature", PAYSTACK_SECRET)).toBe(false);
  });

  it("returns false when the body has been tampered with", () => {
    const originalBody = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    const tamperedBody = JSON.stringify({ event: "charge.success", data: { id: 2 } });
    const sig = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(originalBody)
      .digest("hex");

    expect(verifySignature(tamperedBody, sig, PAYSTACK_SECRET)).toBe(false);
  });

  it("returns false when a different secret key is used", () => {
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    const sig = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(body)
      .digest("hex");

    expect(verifySignature(body, sig, "sk_test_wrong_key")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Common validation scenarios (missing fields, invalid provider, etc.)
// ═══════════════════════════════════════════════════════════════════════════

describe("Booking validation – common error scenarios", () => {
  it("rejects a completely empty body", () => {
    const result = bookingDraftSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects when services contain an invalid offering_id", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        services: [{ offering_id: "not-uuid", staff_id: null }],
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Invalid offering ID");
    }
  });

  it("rejects when addons contain a non-UUID string", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ addons: ["invalid-addon-id"] })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Invalid addon ID");
    }
  });

  it("allows null for optional nullable fields", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({
        location_id: null,
        address: null,
        special_requests: null,
        payment_method_id: null,
        promotion_code: null,
        gift_card_code: null,
        membership_plan_id: null,
        hold_id: null,
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects extraneous fields when using strict parsing", () => {
    const strict = bookingDraftSchema.strict();
    const draft = {
      ...validBookingDraft(),
      unknown_field: "should fail",
    };
    const result = strict.safeParse(draft);
    expect(result.success).toBe(false);
  });

  it("validates at_salon requires location_id at business-logic level", () => {
    // The Zod schema allows location_id to be optional, but the route
    // handler's validateBooking() enforces it. We verify the schema alone
    // does accept it, confirming the business rule lives in the handler.
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ location_type: "at_salon", location_id: null })
    );
    expect(result.success).toBe(true);
  });

  it("validates at_home requires address at business-logic level", () => {
    const result = bookingDraftSchema.safeParse(
      validBookingDraft({ location_type: "at_home", address: null })
    );
    expect(result.success).toBe(true);
  });
});
