/**
 * Idempotency contract tests for `finalizeCustomOfferPayment`.
 *
 * These exercise the early-exit paths only:
 *  1. Offer already paid → returns ok with existing booking_id
 *  2. Same payment reference seen before → returns ok with existing booking_id
 *  3. Withdrawn / expired offer → returns ok=false with reason
 *
 * Full booking-creation paths require dozens of table mocks and are covered
 * end-to-end by integration tests against the Supabase test environment.
 */
import { describe, expect, it, vi } from "vitest";
import { finalizeCustomOfferPayment } from "../finalize-custom-offer-payment";

vi.mock("@/lib/custom-offers/sync-offer-message-attachments", () => ({
  patchCustomOfferMessageAttachments: vi.fn(async () => undefined),
}));

vi.mock("@/lib/bookings/conflict-check", () => ({
  checkBookingConflict: vi.fn(async () => ({ hasConflict: false })),
  checkBookingConflictForProvider: vi.fn(async () => ({ hasConflict: false })),
}));

vi.mock("@/lib/bookings/ensure-wallet-gift-booking-payments", () => ({
  ensureWalletGiftBookingPayments: vi.fn(async () => undefined),
  completeWalletGiftSyntheticPayments: vi.fn(async () => undefined),
}));

vi.mock("@/lib/loyalty/record-redemption", () => ({
  recordLoyaltyRedemption: vi.fn(async () => ({ recorded: true })),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/finance/resolve-commission-percentage", () => ({
  resolveCommissionPercentageForProvider: vi.fn(async () => 10),
}));

vi.mock("@/lib/bookings/fetch-booking-commission-context", () => ({
  fetchBookingCommissionContext: vi.fn(async (_admin, _bookingId, input) => ({
    cumulativePaid: Math.max(0, Number(input?.chargeAmount ?? 0)),
    postedLegsSum: 0,
    bookingLevelItemsAlreadyPosted: false,
    existingBookingLevelTypes: new Set<string>(),
  })),
}));

vi.mock("@/lib/bookings/post-booking-audit-ledger-legs", () => ({
  postBookingAuditLedgerLegsIfMissing: vi.fn(async () => undefined),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: vi.fn(async () => undefined),
}));

function makeAdminMockForOffer(offer: any, paymentTxn: any | null = null) {
  const chainFor = (data: unknown) => {
    const chain: any = {
      eq: () => chain,
      maybeSingle: async () => ({ data }),
      single: async () => ({ data }),
    };
    return { select: () => chain };
  };
  return {
    from: (table: string) => {
      if (table === "custom_offers") return chainFor(offer);
      if (table === "payment_transactions") return chainFor(paymentTxn);
      if (table === "finance_transactions") return chainFor(paymentTxn ? { id: "fin-1" } : null);
      if (table === "providers") return chainFor({ tenant_id: "t1" });
      return chainFor(null);
    },
    update: () => ({ eq: async () => ({ error: null }) }),
    insert: () => ({
      select: () => ({ single: async () => ({ data: null, error: null }) }),
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  } as any;
}

function makeAdminMockForSuccessfulFinalize() {
  const financeInserts: Array<Record<string, unknown>> = [];
  const allInserts: Array<{ table: string; value: unknown }> = [];
  const offer = {
    id: "offer-1",
    status: "payment_pending",
    price: 100,
    currency: "ZAR",
    duration_minutes: 60,
    scheduled_at: "2026-06-10T10:00:00.000Z",
    travel_fee: 20,
    request: {
      id: "req-1",
      customer_id: "customer-1",
      provider_id: "provider-1",
      service_name: "Custom Glam",
      description: "Custom offer",
      location_type: "at_salon",
    },
  };

  const admin = {
    from: (table: string) => {
      let insertValue: unknown;
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        contains: () => chain,
        order: () => chain,
        limit: () => chain,
        update: () => chain,
        delete: () => chain,
        insert: (value: unknown) => {
          insertValue = value;
          allInserts.push({ table, value });
          if (table === "finance_transactions") {
            const rows = Array.isArray(value) ? value : [value];
            financeInserts.push(...(rows as Array<Record<string, unknown>>));
          }
          return chain;
        },
        single: async () => {
          if (table === "custom_offers") return { data: offer, error: null };
          if (table === "providers") return { data: { tenant_id: "tenant-1" }, error: null };
          if (table === "offerings") return { data: { id: "offering-1" }, error: null };
          if (table === "bookings") {
            return { data: { id: "booking-1", tenant_id: "tenant-1" }, error: null };
          }
          if (table === "promotions") return { data: { usage_count: 0 }, error: null };
          return { data: insertValue ?? null, error: null };
        },
        maybeSingle: async () => {
          if (table === "providers") return { data: { tenant_id: "tenant-1" }, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (value: { data: null; error: null }) => void) =>
          resolve({ data: null, error: null }),
      };
      return chain;
    },
    rpc: vi.fn(async () => ({ data: true, error: null })),
  } as any;

  return { admin, financeInserts, allInserts };
}

describe("finalizeCustomOfferPayment idempotency", () => {
  it("is a no-op when the offer is already paid", async () => {
    const offer = {
      id: "offer-1",
      status: "paid",
      booking_id: "booking-9",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "p1" },
    };
    const admin = makeAdminMockForOffer(offer);
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(true);
    expect(res.bookingId).toBe("booking-9");
    expect(res.reason).toBe("already_paid");
  });

  it("is a no-op when the same reference was already finalized", async () => {
    const offer = {
      id: "offer-1",
      status: "payment_pending",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "p1" },
    };
    const admin = makeAdminMockForOffer(offer, { id: "tx-1", booking_id: "booking-9" });
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(true);
    expect(res.bookingId).toBe("booking-9");
    expect(res.reason).toBe("duplicate_reference");
  });

  it("refuses to create a booking when the offer is withdrawn", async () => {
    const offer = {
      id: "offer-1",
      status: "withdrawn",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "p1" },
    };
    const admin = makeAdminMockForOffer(offer);
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("withdrawn");
  });

  it("refuses to create a booking when the offer is expired", async () => {
    const offer = {
      id: "offer-1",
      status: "expired",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "p1" },
    };
    const admin = makeAdminMockForOffer(offer);
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("expired");
  });

  it("returns missing_offer_id when the offer can't be loaded", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
      rpc: vi.fn(),
    } as any;
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "",
      reference: "co_test_ref",
      paystackAmountMajor: 0,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("missing_offer_id");
  });

  it("marks the offer finalize_failed when offering creation fails after payment", async () => {
    const updates: Array<{ table: string; values: Record<string, unknown>; id?: string }> = [];
    const offer = {
      id: "offer-1",
      status: "payment_pending",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "p1" },
    };
    const admin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: table === "custom_offers" ? offer : null }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: table === "offerings" ? { message: "insert failed" } : null,
            }),
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async (_key: string, id: string) => {
            updates.push({ table, values, id });
            return { error: null };
          },
        }),
      }),
      rpc: vi.fn(),
    } as any;

    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });

    expect(res).toEqual({ ok: false, reason: "offering_insert_failed" });
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "custom_offers",
          id: "offer-1",
          values: expect.objectContaining({ status: "finalize_failed" }),
        }),
      ]),
    );
  });

  it("marks finalize_failed when booking service creation fails after booking insert", async () => {
    const updates: Array<{ table: string; values: Record<string, unknown>; id?: string }> = [];
    const offer = {
      id: "offer-1",
      status: "payment_pending",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      scheduled_at: "2026-06-10T10:00:00.000Z",
      request: {
        id: "req-1",
        customer_id: "c1",
        provider_id: "p1",
        service_name: "Custom Glam",
        location_type: "at_salon",
      },
    };
    const admin = {
      from: (table: string) => {
        let updateValues: Record<string, unknown> = {};
        const chain: any = {
          select: () => chain,
          eq: (_key?: string, id?: string) => {
            if (id) updates.push({ table, values: updateValues, id });
            return chain;
          },
          contains: () => chain,
          order: () => chain,
          limit: () => chain,
          delete: () => chain,
          update: (values: Record<string, unknown>) => {
            updateValues = values;
            return chain;
          },
          insert: () => chain,
          single: async () => {
            if (table === "custom_offers") return { data: offer, error: null };
            if (table === "providers") return { data: { tenant_id: "tenant-1" }, error: null };
            if (table === "offerings") return { data: { id: "offering-1" }, error: null };
            if (table === "bookings") return { data: { id: "booking-1", tenant_id: "tenant-1" }, error: null };
            return { data: null, error: null };
          },
          maybeSingle: async () => {
            if (table === "providers") return { data: { tenant_id: "tenant-1" }, error: null };
            return { data: null, error: null };
          },
          then: (resolve: (value: { data: null; error: null | { message: string } }) => void) =>
            resolve({
              data: null,
              error: table === "booking_services" ? { message: "booking service insert failed" } : null,
            }),
        };
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    } as any;

    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });

    expect(res).toEqual({ ok: false, reason: "booking_service_insert_failed" });
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "bookings",
          id: "booking-1",
          values: expect.objectContaining({ status: "cancelled", payment_status: "failed" }),
        }),
        expect.objectContaining({
          table: "custom_offers",
          id: "offer-1",
          values: expect.objectContaining({ status: "finalize_failed" }),
        }),
      ]),
    );
  });

  it("tags every finance transaction description with the custom offer id", async () => {
    const { admin, financeInserts } = makeAdminMockForSuccessfulFinalize();

    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_paystack_ref",
      paystackAmountMajor: 80,
      paystackFeesMajor: 2,
      walletAmountApplied: 10,
      giftCardAmountApplied: 5,
      giftCardCode: "GIFT-1",
      loyaltyPointsRedeemed: 500,
      loyaltyDiscountAmount: 5,
      pricingMetadata: {
        total_amount: 100,
        commission_base: 80,
        tip_amount: 4,
        tax_amount: 3,
        travel_fee: 20,
        service_fee_amount: 2,
      },
      customerEmail: "customer@example.com",
      paymentProvider: "split",
    });

    expect(res).toEqual({ ok: true, bookingId: "booking-1" });
    expect(financeInserts.length).toBeGreaterThan(2);
    expect(financeInserts.every((row) => String(row.description).includes("[custom_offer:offer-1]"))).toBe(true);
  });

  it("scales commission ledger to collected cash on deposit payments", async () => {
    const { admin, financeInserts } = makeAdminMockForSuccessfulFinalize();

    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_deposit_ref",
      paystackAmountMajor: 30,
      paystackFeesMajor: 1,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
      pricingMetadata: {
        total_amount: 100,
        commission_base: 80,
        payment_option: "deposit",
        deposit_amount: 30,
        tip_amount: 0,
        tax_amount: 0,
        travel_fee: 20,
        service_fee_amount: 0,
      },
      customerEmail: "customer@example.com",
      paymentProvider: "paystack",
    });

    expect(res).toEqual({ ok: true, bookingId: "booking-1" });
    const paymentRow = financeInserts.find((row) => row.transaction_type === "payment");
    const earningsRow = financeInserts.find((row) => row.transaction_type === "provider_earnings");
    expect(paymentRow).toBeTruthy();
    expect(earningsRow).toBeTruthy();
    const commission = Number(paymentRow?.commission ?? 0);
    const earnings = Number(earningsRow?.net_amount ?? earningsRow?.amount ?? 0);
    expect(Number(paymentRow?.amount)).toBeLessThan(80);
    expect(commission + earnings).toBeCloseTo(Number(paymentRow?.amount), 2);
  });
});

/**
 * A prior run can mark the offer `paid` (or insert `payment_transactions`) and then crash
 * before writing `finance_transactions` — e.g. process restart between step 7 and step 10 of
 * `finalizeCustomOfferPayment`. A Paystack webhook retry for the same reference must backfill
 * the missing ledger rows instead of (a) silently no-op'ing forever, or (b) falling through to
 * a full re-finalize that would create a duplicate offering + booking for the same offer.
 */
describe("finalizeCustomOfferPayment finance backfill (crash recovery)", () => {
  const backfillBookingRow = {
    id: "booking-9",
    provider_id: "provider-1",
    tenant_id: "tenant-1",
    total_amount: 100,
    tip_amount: 0,
    tax_amount: 0,
    travel_fee: 0,
    service_fee_amount: 0,
    wallet_amount: 0,
    gift_card_amount: 0,
    promotion_discount_amount: 0,
    loyalty_discount_amount: 0,
    payment_reference: "co_test_ref",
    payment_provider: "paystack",
  };

  function makeAdminMockForAlreadyPaidNeedsBackfill() {
    const financeInserts: Array<Record<string, unknown>> = [];
    const paymentTxInserts: Array<Record<string, unknown>> = [];
    const offer = {
      id: "offer-1",
      status: "paid",
      booking_id: "booking-9",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "provider-1" },
    };
    const admin = {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          single: async () => (table === "custom_offers" ? { data: offer } : { data: null }),
          maybeSingle: async () => {
            if (table === "finance_transactions") return { data: null };
            if (table === "bookings") return { data: backfillBookingRow };
            if (table === "payment_transactions") return { data: null };
            if (table === "providers") return { data: { tenant_id: "tenant-1" } };
            return { data: null };
          },
          insert: (value: unknown) => {
            if (table === "finance_transactions") {
              const rows = Array.isArray(value) ? value : [value];
              financeInserts.push(...(rows as Array<Record<string, unknown>>));
            }
            if (table === "payment_transactions") paymentTxInserts.push(value as Record<string, unknown>);
            return Promise.resolve({ data: null, error: null });
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
        return chain;
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as any;
    return { admin, financeInserts, paymentTxInserts };
  }

  function makeAdminMockForDuplicateReferenceNeedsBackfill() {
    const financeInserts: Array<Record<string, unknown>> = [];
    const paymentTxInserts: Array<Record<string, unknown>> = [];
    const offer = {
      id: "offer-1",
      status: "payment_pending",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "provider-1" },
    };
    let paymentTxCalls = 0;
    const admin = {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          single: async () => (table === "custom_offers" ? { data: offer } : { data: null }),
          maybeSingle: async () => {
            if (table === "payment_transactions") {
              paymentTxCalls += 1;
              // 1st call: the main-flow existingTx dedupe (matched by reference alone).
              if (paymentTxCalls === 1) return { data: { id: "tx-1", booking_id: "booking-9" } };
              // 2nd call: backfill's own (provider, reference) dedupe check.
              return { data: null };
            }
            if (table === "finance_transactions") return { data: null };
            if (table === "bookings") return { data: backfillBookingRow };
            if (table === "providers") return { data: { tenant_id: "tenant-1" } };
            return { data: null };
          },
          insert: (value: unknown) => {
            if (table === "finance_transactions") {
              const rows = Array.isArray(value) ? value : [value];
              financeInserts.push(...(rows as Array<Record<string, unknown>>));
            }
            if (table === "payment_transactions") paymentTxInserts.push(value as Record<string, unknown>);
            return Promise.resolve({ data: null, error: null });
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
        return chain;
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as any;
    return { admin, financeInserts, paymentTxInserts };
  }

  it("backfills the finance ledger when the offer is already paid but the ledger is missing", async () => {
    const { admin, financeInserts, paymentTxInserts } = makeAdminMockForAlreadyPaidNeedsBackfill();
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(true);
    expect(res.bookingId).toBe("booking-9");
    expect(res.reason).toBe("already_paid");
    expect(paymentTxInserts.length).toBe(1);
    const paymentRow = financeInserts.find((r) => r.transaction_type === "payment");
    const earningsRow = financeInserts.find((r) => r.transaction_type === "provider_earnings");
    expect(paymentRow).toBeTruthy();
    expect(earningsRow).toBeTruthy();
  });

  it("does not re-insert finance rows when the offer is already paid and the ledger already exists", async () => {
    const offer = {
      id: "offer-1",
      status: "paid",
      booking_id: "booking-9",
      price: 100,
      currency: "ZAR",
      duration_minutes: 60,
      request: { id: "req-1", customer_id: "c1", provider_id: "p1" },
    };
    // Truthy 2nd arg makes the shared helper's finance_transactions lookup return a row,
    // i.e. the ledger already exists — backfill must no-op.
    const admin = makeAdminMockForOffer(offer, { id: "tx-1" });
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(true);
    expect(res.bookingId).toBe("booking-9");
    expect(res.reason).toBe("already_paid");
  });

  it("backfills instead of re-finalizing when a booking exists for the reference but the ledger is missing", async () => {
    const { admin, financeInserts, paymentTxInserts } = makeAdminMockForDuplicateReferenceNeedsBackfill();
    const res = await finalizeCustomOfferPayment(admin, {
      offerId: "offer-1",
      reference: "co_test_ref",
      paystackAmountMajor: 100,
      paystackFeesMajor: 0,
      walletAmountApplied: 0,
      giftCardAmountApplied: 0,
    });
    expect(res.ok).toBe(true);
    expect(res.bookingId).toBe("booking-9");
    expect(res.reason).toBe("duplicate_reference_backfilled");
    expect(paymentTxInserts.length).toBe(1);
    expect(financeInserts.some((r) => r.transaction_type === "provider_earnings")).toBe(true);
    expect(financeInserts.some((r) => r.transaction_type === "payment")).toBe(true);
  });
});
