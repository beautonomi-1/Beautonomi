import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * §custom-offer-save-card-tests 2026-05: pin the metadata contract used by
 * Paystack `charge.success` for custom offers:
 *  - New-card hosted checkout: metadata includes `save_card: true`,
 *    `customer_id`, and `set_as_default` so the webhook can tokenize the card.
 *  - Saved-card charge: `save_card` is *not* propagated, even if the client
 *    sent it (a stored authorization is already in use).
 *  - Wallet rollback runs when Paystack init fails before the customer can
 *    enter card details.
 */

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantId = vi.fn();
const mockGetTenantRegionConfig = vi.fn();
const mockResolveTenantIdForFinanceLedger = vi.fn();
const mockIsFeatureEnabledServer = vi.fn();
const mockResourceTenantMatchesHostTenant = vi.fn();
const mockComputeCustomOfferPricing = vi.fn();
const mockComputeCustomOfferSplits = vi.fn();
const mockInitializePaystackTransaction = vi.fn();
const mockChargeAuthorization = vi.fn();
const mockPatchCustomOfferMessageAttachments = vi.fn();
const mockFinalizeCustomOfferPayment = vi.fn();
const mockIsPaymentMethodExpired = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantId(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: (...args: unknown[]) =>
    mockResolveTenantIdForFinanceLedger(...args),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: (...args: unknown[]) => mockIsFeatureEnabledServer(...args),
}));

vi.mock("@/lib/server/feature-flag-keys", () => ({
  FEATURE_FLAG_KEYS: { CUSTOM_OFFER_FULL_CHECKOUT: "commerce.custom_offer_full_checkout" },
}));

vi.mock("@/lib/subscriptions/entitlements", () => ({
  isWalletEnabledForTenant: vi.fn().mockResolvedValue(true),
  isGiftCardsEnabledForTenant: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/bookings/resolve-payment-tenant", () => ({
  resourceTenantMatchesHostTenant: (...args: unknown[]) =>
    mockResourceTenantMatchesHostTenant(...args),
}));

vi.mock("../custom-offer-pricing", () => ({
  computeCustomOfferPricing: (...args: unknown[]) => mockComputeCustomOfferPricing(...args),
}));

vi.mock("../custom-offer-splits", () => ({
  computeCustomOfferSplits: (...args: unknown[]) => mockComputeCustomOfferSplits(...args),
}));

vi.mock("@/lib/payments/paystack-server", () => ({
  initializePaystackTransaction: (...args: unknown[]) =>
    mockInitializePaystackTransaction(...args),
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  chargeAuthorization: (...args: unknown[]) => mockChargeAuthorization(...args),
  convertFromSmallestUnit: (n: number) => n / 100,
}));

vi.mock("@/lib/custom-offers/sync-offer-message-attachments", () => ({
  patchCustomOfferMessageAttachments: (...args: unknown[]) =>
    mockPatchCustomOfferMessageAttachments(...args),
}));

vi.mock("@/lib/custom-offers/finalize-custom-offer-payment", () => ({
  finalizeCustomOfferPayment: (...args: unknown[]) => mockFinalizeCustomOfferPayment(...args),
}));

vi.mock("@/lib/payments/payment-method-expiry", () => ({
  isPaymentMethodExpired: (...args: unknown[]) => mockIsPaymentMethodExpired(...args),
}));

const PROVIDER_ID = "11111111-1111-1111-1111-111111111111";
const OFFER_ID = "22222222-2222-2222-2222-222222222222";
const CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";

interface OfferFixture {
  offer?: any;
  provider?: any;
  paymentMethod?: any;
}

function buildSupabaseMock(fixture: OfferFixture) {
  const customOffersBuilder: any = {};
  customOffersBuilder.select = vi.fn().mockReturnValue(customOffersBuilder);
  customOffersBuilder.eq = vi.fn().mockReturnValue(customOffersBuilder);
  customOffersBuilder.single = vi.fn().mockResolvedValue({
    data:
      fixture.offer ?? {
        id: OFFER_ID,
        status: "pending",
        price: 1000,
        currency: "ZAR",
        request_id: "req-1",
        location_id: null,
        request: {
          id: "req-1",
          customer_id: CUSTOMER_ID,
          provider_id: PROVIDER_ID,
          preferred_start_at: null,
          location_type: "at_salon",
          status: "pending",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    error: null,
  });

  const providersBuilder: any = {};
  providersBuilder.select = vi.fn().mockReturnValue(providersBuilder);
  providersBuilder.eq = vi.fn().mockReturnValue(providersBuilder);
  providersBuilder.maybeSingle = vi
    .fn()
    .mockResolvedValue(fixture.provider ?? { data: { tenant_id: "tenant-1" }, error: null });

  const paymentMethodsBuilder: any = {};
  paymentMethodsBuilder.select = vi.fn().mockReturnValue(paymentMethodsBuilder);
  paymentMethodsBuilder.eq = vi.fn().mockReturnValue(paymentMethodsBuilder);
  paymentMethodsBuilder.single = vi
    .fn()
    .mockResolvedValue(fixture.paymentMethod ?? { data: null, error: { code: "PGRST116" } });

  return {
    from: vi.fn((table: string) => {
      if (table === "custom_offers") return customOffersBuilder;
      if (table === "providers") return providersBuilder;
      if (table === "payment_methods") return paymentMethodsBuilder;
      return { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  };
}

function buildAdminMock() {
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(updateChain),
    }),
  };
}

function buildPostRequest(body: Record<string, unknown> | null): NextRequest {
  return new NextRequest(`http://localhost/api/me/custom-offers/${OFFER_ID}/pay`, {
    method: "POST",
    body: body == null ? undefined : JSON.stringify(body),
    headers: body == null ? undefined : { "content-type": "application/json" },
  });
}

describe("postCustomOfferAccept — save_card metadata contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: CUSTOMER_ID, email: "buyer@example.com", role: "customer" },
    });
    mockResolveTenantId.mockResolvedValue("tenant-1");
    mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
    mockResolveTenantIdForFinanceLedger.mockResolvedValue("tenant-1");
    mockIsFeatureEnabledServer.mockResolvedValue(false);
    mockResourceTenantMatchesHostTenant.mockReturnValue(true);
    mockIsPaymentMethodExpired.mockReturnValue(false);
    mockComputeCustomOfferPricing.mockResolvedValue({
      ok: true,
      result: {
        subtotal: 1000,
        tipAmount: 0,
        taxAmount: 0,
        taxRate: 0,
        travelFee: 0,
        serviceFeeAmount: 0,
        serviceFeePercentage: 0,
        promotionId: null,
        promotionDiscountAmount: 0,
        membershipDiscountAmount: 0,
        membershipPlanId: null,
        membershipId: null,
        commissionBase: 1000,
        totalAmount: 1000,
        loyaltyPointsRedeemed: 0,
        loyaltyDiscountAmount: 0,
      },
    });
    mockComputeCustomOfferSplits.mockResolvedValue({
      ok: true,
      result: {
        walletAmount: 0,
        giftCardAmount: 0,
        giftCardId: null,
        loyaltyPointsRedeemed: 0,
        loyaltyDiscountAmount: 0,
        paystackAmount: 1000,
      },
    });
    mockInitializePaystackTransaction.mockResolvedValue({
      data: { authorization_url: "https://checkout.paystack.test/pay" },
    });
    mockChargeAuthorization.mockResolvedValue({
      status: true,
      data: { reference: "co_charge_ref", fees: 0 },
    });
    mockFinalizeCustomOfferPayment.mockResolvedValue({ ok: true, bookingId: "booking-1" });
    mockPatchCustomOfferMessageAttachments.mockResolvedValue(undefined);
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock());
  });

  it("sends save_card=true and customer_id in Paystack metadata on new-card path", async () => {
    mockGetSupabaseServer.mockResolvedValue(buildSupabaseMock({}));
    const { postCustomOfferAccept } = await import("../post-custom-offer-accept");
    const res = await postCustomOfferAccept(
      buildPostRequest({ payment_option: "full", save_card: true, set_as_default: true }),
      { params: Promise.resolve({ id: OFFER_ID }) },
    );
    expect(res.status).toBe(200);
    expect(mockInitializePaystackTransaction).toHaveBeenCalledTimes(1);
    const call = mockInitializePaystackTransaction.mock.calls[0][0];
    expect(call.metadata).toMatchObject({
      custom_offer_id: OFFER_ID,
      customer_id: CUSTOMER_ID,
      save_card: true,
      set_as_default: true,
    });
  });

  it("never forwards save_card on the saved-card charge path", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      buildSupabaseMock({
        paymentMethod: {
          data: {
            id: "pm-1",
            user_id: CUSTOMER_ID,
            provider_payment_method_id: "AUTH_test123",
            expiry_month: 12,
            expiry_year: 2099,
            is_active: true,
            provider: "paystack",
          },
          error: null,
        },
      }),
    );
    const { postCustomOfferAccept } = await import("../post-custom-offer-accept");
    const res = await postCustomOfferAccept(
      buildPostRequest({
        payment_option: "full",
        payment_method_id: "pm-1",
        save_card: true,
      }),
      { params: Promise.resolve({ id: OFFER_ID }) },
    );
    expect(res.status).toBe(200);
    expect(mockInitializePaystackTransaction).not.toHaveBeenCalled();
    expect(mockChargeAuthorization).toHaveBeenCalledTimes(1);
    const [, , , chargeMetadata] = mockChargeAuthorization.mock.calls[0];
    expect(chargeMetadata).toMatchObject({ customer_id: CUSTOMER_ID, save_card: false });
  });

  it("returns 502 PAYMENT_INIT_FAILED when Paystack init throws", async () => {
    mockGetSupabaseServer.mockResolvedValue(buildSupabaseMock({}));
    mockInitializePaystackTransaction.mockRejectedValueOnce(new Error("paystack 5xx"));
    const { postCustomOfferAccept } = await import("../post-custom-offer-accept");
    const res = await postCustomOfferAccept(
      buildPostRequest({ payment_option: "full", save_card: true }),
      { params: Promise.resolve({ id: OFFER_ID }) },
    );
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error.code).toBe("PAYMENT_INIT_FAILED");
  });
});

/**
 * Zero-Paystack path: wallet (and/or gift card) fully covers the collectible,
 * so no Paystack call happens and finalize runs inline. Finalize only settles
 * from `payment_pending`, so accept must claim that status first — and reset
 * to `pending` (tenders refunded) when finalize fails so the customer can retry.
 */
describe("postCustomOfferAccept — zero-Paystack (wallet fully covers)", () => {
  function buildRecordingAdminMock() {
    const updates: Array<Record<string, unknown>> = [];
    const updateMock = vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      const chain: any = {
        eq: vi.fn(() => chain),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    });
    return {
      admin: { from: vi.fn().mockReturnValue({ update: updateMock }) },
      updates,
      updateMock,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: CUSTOMER_ID, email: "buyer@example.com", role: "customer" },
    });
    mockResolveTenantId.mockResolvedValue("tenant-1");
    mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
    mockResolveTenantIdForFinanceLedger.mockResolvedValue("tenant-1");
    mockIsFeatureEnabledServer.mockResolvedValue(true);
    mockResourceTenantMatchesHostTenant.mockReturnValue(true);
    mockComputeCustomOfferPricing.mockResolvedValue({
      ok: true,
      result: {
        subtotal: 1000,
        tipAmount: 0,
        taxAmount: 0,
        taxRate: 0,
        travelFee: 0,
        serviceFeeAmount: 0,
        serviceFeePercentage: 0,
        promotionId: null,
        promotionDiscountAmount: 0,
        membershipDiscountAmount: 0,
        membershipPlanId: null,
        membershipId: null,
        commissionBase: 1000,
        totalAmount: 1000,
        loyaltyPointsRedeemed: 0,
        loyaltyDiscountAmount: 0,
      },
    });
    mockComputeCustomOfferSplits.mockResolvedValue({
      ok: true,
      result: {
        walletAmount: 1000,
        giftCardAmount: 0,
        giftCardId: null,
        loyaltyPointsRedeemed: 0,
        loyaltyDiscountAmount: 0,
        paystackAmount: 0,
      },
    });
    mockFinalizeCustomOfferPayment.mockResolvedValue({ ok: true, bookingId: "booking-1" });
    mockPatchCustomOfferMessageAttachments.mockResolvedValue(undefined);
  });

  function buildZeroPaystackSupabase() {
    const supabase = buildSupabaseMock({});
    supabase.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    return supabase;
  }

  it("claims payment_pending before calling finalize", async () => {
    const { admin, updates, updateMock } = buildRecordingAdminMock();
    mockGetSupabaseAdmin.mockReturnValue(admin);
    mockGetSupabaseServer.mockResolvedValue(buildZeroPaystackSupabase());

    const { postCustomOfferAccept } = await import("../post-custom-offer-accept");
    const res = await postCustomOfferAccept(
      buildPostRequest({ payment_option: "full", use_wallet: true }),
      { params: Promise.resolve({ id: OFFER_ID }) },
    );

    expect(res.status).toBe(200);
    expect(mockInitializePaystackTransaction).not.toHaveBeenCalled();
    expect(mockChargeAuthorization).not.toHaveBeenCalled();

    expect(updates.some((u) => u.status === "payment_pending")).toBe(true);
    // The payment_pending claim must land before finalize runs.
    const pendingCallOrder = updateMock.mock.invocationCallOrder[0];
    const finalizeCallOrder = mockFinalizeCustomOfferPayment.mock.invocationCallOrder[0];
    expect(pendingCallOrder).toBeLessThan(finalizeCallOrder);

    const finalizeInput = mockFinalizeCustomOfferPayment.mock.calls[0][1];
    expect(finalizeInput).toMatchObject({
      offerId: OFFER_ID,
      paystackAmountMajor: 0,
      walletAmountApplied: 1000,
      paymentProvider: "wallet",
    });

    const body = await res.json();
    expect(body.data).toMatchObject({ finalized: true, booking_id: "booking-1" });
  });

  it("refunds the wallet and resets to pending when finalize fails", async () => {
    const { admin, updates } = buildRecordingAdminMock();
    mockGetSupabaseAdmin.mockReturnValue(admin);
    const supabase = buildZeroPaystackSupabase();
    mockGetSupabaseServer.mockResolvedValue(supabase);
    mockFinalizeCustomOfferPayment.mockResolvedValue({
      ok: false,
      reason: "unexpected_status:withdrawn",
    });

    const { postCustomOfferAccept } = await import("../post-custom-offer-accept");
    const res = await postCustomOfferAccept(
      buildPostRequest({ payment_option: "full", use_wallet: true }),
      { params: Promise.resolve({ id: OFFER_ID }) },
    );

    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe("FINALIZE_FAILED");

    // Wallet debited then credited back.
    const rpcNames = (supabase.rpc as any).mock.calls.map((c: unknown[]) => c[0]);
    expect(rpcNames).toContain("wallet_debit_self");
    expect(rpcNames).toContain("wallet_credit_self");

    // Offer reset to pending so the customer can retry, chat card kept in sync.
    expect(updates.some((u) => u.status === "payment_pending")).toBe(true);
    expect(updates.some((u) => u.status === "pending" && u.payment_reference === null)).toBe(true);
    expect(mockPatchCustomOfferMessageAttachments).toHaveBeenCalledWith(
      expect.anything(),
      OFFER_ID,
      { status: "pending" },
    );
  });
});
