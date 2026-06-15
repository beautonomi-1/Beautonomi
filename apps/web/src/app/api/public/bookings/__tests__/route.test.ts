/**
 * POST /api/public/bookings — route-level integration tests.
 *
 * Exercises the handler wiring (auth, tenant, validation pipeline, booking
 * creation, payment) beyond the Zod schema unit tests in booking-flow.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEST_PROVIDER_ID = "00000000-0000-4000-8000-000000000001";
const TEST_OFFERING_ID = "00000000-0000-4000-8000-000000000010";
const TEST_LOCATION_ID = "00000000-0000-4000-8000-000000000020";
const TEST_TENANT_ID = "00000000-0000-4000-8000-000000000099";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000088";
const TEST_BOOKING_ID = "00000000-0000-4000-8000-000000000077";

const mockCheckBookingCreationRateLimit = vi.fn();
const mockIncrementBookingCreation = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockRequirePublicTenant = vi.fn();
const mockEvaluateMarketAvailabilityFromRequest = vi.fn();
const mockVerifyPublicBookingCaptcha = vi.fn();
const mockEnsureUserProfileForAuthUser = vi.fn();
const mockValidateBooking = vi.fn();
const mockCreateBookingRecord = vi.fn();
const mockProcessPayment = vi.fn();
const mockPostBookingEffects = vi.fn();
const mockReleaseBookingSlotAfterPaymentFailure = vi.fn();

vi.mock("@/lib/rate-limit/booking-creation", () => ({
  checkBookingCreationRateLimit: (...args: unknown[]) => mockCheckBookingCreationRateLimit(...args),
  incrementBookingCreation: (...args: unknown[]) => mockIncrementBookingCreation(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/require-public-tenant", () => ({
  requirePublicTenant: (...args: unknown[]) => mockRequirePublicTenant(...args),
}));

vi.mock("@/lib/tenant/market-availability", () => ({
  evaluateMarketAvailabilityFromRequest: (...args: unknown[]) =>
    mockEvaluateMarketAvailabilityFromRequest(...args),
}));

vi.mock("@/lib/security/captcha", () => ({
  verifyPublicBookingCaptcha: (...args: unknown[]) => mockVerifyPublicBookingCaptcha(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/ensure-user-profile", () => ({
  ensureUserProfileForAuthUser: (...args: unknown[]) => mockEnsureUserProfileForAuthUser(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/validate-booking", () => ({
  validateBooking: (...args: unknown[]) => mockValidateBooking(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/create-booking-record", () => ({
  createBookingRecord: (...args: unknown[]) => mockCreateBookingRecord(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/process-payment", () => ({
  processPayment: (...args: unknown[]) => mockProcessPayment(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/post-booking", () => ({
  postBookingEffects: (...args: unknown[]) => mockPostBookingEffects(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/release-booking-slot-after-payment-failure", () => ({
  releaseBookingSlotAfterPaymentFailure: (...args: unknown[]) =>
    mockReleaseBookingSlotAfterPaymentFailure(...args),
}));

vi.mock("@/lib/bookings/provider-bookings-read-cache", () => ({
  invalidateProviderBookingsReadCache: vi.fn(),
}));

vi.mock("@/lib/http/idempotency", () => ({
  extractIdempotencyKey: vi.fn(() => null),
  lookupIdempotentResponse: vi.fn(async () => null),
  rememberIdempotentResponse: vi.fn(async () => undefined),
}));

function validBookingBody() {
  return {
    provider_id: TEST_PROVIDER_ID,
    services: [{ offering_id: TEST_OFFERING_ID, staff_id: null }],
    selected_datetime: "2026-03-15T10:00:00Z",
    location_type: "at_salon",
    location_id: TEST_LOCATION_ID,
    payment_method: "card",
    payment_option: "full",
  };
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/public/bookings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function buildSupabaseAdminMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "tenants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { slug: "south-africa" }, error: null }),
            })),
          })),
        };
      }
      if (table === "bookings") {
        const chain = {
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        return {
          select: vi.fn(() => chain),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
    }),
  };
}

describe("POST /api/public/bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckBookingCreationRateLimit.mockResolvedValue({ allowed: true });
    mockIncrementBookingCreation.mockReturnValue(undefined);
    mockRequirePublicTenant.mockResolvedValue({ tenantId: TEST_TENANT_ID });
    mockEvaluateMarketAvailabilityFromRequest.mockReturnValue({ status: "available" });
    mockVerifyPublicBookingCaptcha.mockResolvedValue({ ok: true });
    mockEnsureUserProfileForAuthUser.mockResolvedValue(undefined);
    mockGetSupabaseAdmin.mockReturnValue(buildSupabaseAdminMock());
    mockValidateBooking.mockResolvedValue({
      customerId: TEST_USER_ID,
      appointmentStatus: "pending_payment",
      showServiceFeeToCustomer: false,
      serviceFeeAmount: 0,
      taxAmount: 0,
      taxRate: 0,
      taxIncluded: true,
    });
    mockCreateBookingRecord.mockResolvedValue({
      booking: {
        id: TEST_BOOKING_ID,
        booking_number: "BK-TEST-001",
        provider_id: TEST_PROVIDER_ID,
      },
      createdBookingServices: [],
    });
    mockProcessPayment.mockResolvedValue({
      paymentUrl: "https://paystack.com/pay/test",
      paymentReference: "ref_test_001",
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
      paystackAmount: 250,
    });
    mockPostBookingEffects.mockResolvedValue(undefined);
  });

  it("returns 429 when booking creation rate limit is exceeded", async () => {
    mockCheckBookingCreationRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 120,
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest(validBookingBody()));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not authenticated", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest(validBookingBody()));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
    expect(mockValidateBooking).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid booking body", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: TEST_USER_ID, email: "customer@example.com" } },
          error: null,
        }),
      },
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ provider_id: "not-a-uuid" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(mockValidateBooking).not.toHaveBeenCalled();
  });

  it("creates a booking and returns payment details on the happy path", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: TEST_USER_ID, email: "customer@example.com" } },
          error: null,
        }),
      },
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest(validBookingBody()));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data?.booking_id).toBe(TEST_BOOKING_ID);
    expect(body.data?.booking_number).toBe("BK-TEST-001");
    expect(body.data?.payment_url).toBe("https://paystack.com/pay/test");
    expect(body.data?.payment_reference).toBe("ref_test_001");
    expect(mockEnsureUserProfileForAuthUser).toHaveBeenCalled();
    expect(mockValidateBooking).toHaveBeenCalled();
    expect(mockCreateBookingRecord).toHaveBeenCalled();
    expect(mockProcessPayment).toHaveBeenCalled();
    expect(mockPostBookingEffects).toHaveBeenCalled();
  });
});
