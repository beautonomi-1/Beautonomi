import { beforeEach, describe, expect, it, vi } from "vitest";
import { processSuccessfulPayment } from "../payments/webhook/_handlers/charge-success";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { finalizeCustomOfferPaymentFromPaystackEvent } from "@/lib/custom-offers/finalize-custom-offer-payment";
import { applyWalletTopupFromSuccessfulPaystackCharge } from "@/lib/wallet/apply-wallet-topup-from-paystack-success";
import { savePaystackAuthorization } from "../payments/webhook/_handlers/shared";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/bookings/sync-booking-after-paystack-success", () => ({
  syncBookingAfterPaystackSuccess: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/custom-offers/finalize-custom-offer-payment", () => ({
  finalizeCustomOfferPaymentFromPaystackEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/wallet/apply-wallet-topup-from-paystack-success", () => ({
  applyWalletTopupFromSuccessfulPaystackCharge: vi.fn(async () => undefined),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/finance/resolve-commission-percentage", () => ({
  resolveCommissionPercentageForProvider: vi.fn(async () => 10),
}));

vi.mock("@/lib/loyalty/record-redemption", () => ({
  recordLoyaltyRedemption: vi.fn(async () => ({ recorded: true })),
}));

vi.mock("@/lib/recurring/try-create-recurring-from-paystack-metadata", () => ({
  tryCreateCustomerRecurringFromPaystackChargeMetadata: vi.fn(async () => undefined),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
}));

vi.mock("../payments/webhook/_handlers/shared", () => ({
  generateGiftCardCode: vi.fn(() => "GIFT-CODE-1"),
  savePaystackAuthorization: vi.fn(async () => undefined),
}));

type InsertRecord = { table: string; value: unknown };

function createWebhookSupabase() {
  const inserts: InsertRecord[] = [];
  const updates: InsertRecord[] = [];

  function bookingRow(id: string) {
    return {
      id,
      provider_id: "provider-1",
      customer_id: "customer-1",
      booking_number: "B-001",
      total_amount: 100,
      tip_amount: 0,
      tax_amount: 0,
      travel_fee: 0,
      service_fee_amount: 0,
      currency: "ZAR",
      tenant_id: "tenant-1",
    };
  }

  function rowForSingle(table: string) {
    if (table === "bookings") {
      return bookingRow("booking-1");
    }
    if (table === "gift_card_orders") {
      return {
        id: "gift-order-1",
        status: "pending",
        currency: "ZAR",
        amount: 50,
        quantity: 1,
        total_amount: 50,
        purchaser_user_id: "customer-1",
        tenant_id: "tenant-1",
      };
    }
    if (table === "gift_cards") {
      return { id: "gift-card-1", code: "GIFT-CODE-1" };
    }
    return null;
  }

  function rowForMaybeSingle(table: string, filters: Record<string, unknown>) {
    if (table === "providers") return { tenant_id: "tenant-1" };
    // The shared ledger writer reads the booking with maybeSingle, so a
    // single()-only mock made every charge look like a missing booking.
    if (table === "bookings") {
      return typeof filters.id === "string" ? bookingRow(filters.id) : bookingRow("booking-1");
    }
    if (table === "finance_transactions" && filters.booking_id === "booking-second") {
      return { id: "existing-finance-payment" };
    }
    return null;
  }

  function from(table: string) {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      in: () => chain,
      lt: () => chain,
      gt: () => chain,
      maybeSingle: async () => ({ data: rowForMaybeSingle(table, filters), error: null }),
      single: async () => ({ data: rowForSingle(table), error: null }),
      update: (value: unknown) => {
        updates.push({ table, value });
        return chain;
      },
      insert: (value: unknown) => {
        inserts.push({ table, value });
        return chain;
      },
      upsert: (value: unknown) => {
        inserts.push({ table, value });
        return chain;
      },
      then: (resolve: (value: { data: unknown; error: null }) => void) =>
        resolve({ data: null, error: null }),
    };
    return chain;
  }

  return {
    supabase: {
      from: vi.fn(from),
      rpc: vi.fn(async () => ({ data: true, error: null })),
    },
    inserts,
    updates,
  };
}

describe("charge.success integration dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers booking, custom offer, wallet top-up, gift card order, and second-charge paths", async () => {
    const { supabase, inserts, updates } = createWebhookSupabase();

    await processSuccessfulPayment(
      {
        reference: "booking-ref-1",
        amount: 10_000,
        fees: 300,
        customer: { email: "customer@example.com" },
        authorization: {
          authorization_code: "AUTH_1",
          reusable: true,
          last4: "4242",
          exp_month: "12",
          exp_year: "2030",
          brand: "visa",
        },
        metadata: {
          booking_id: "booking-1",
          customer_id: "customer-1",
          save_card: true,
          set_as_default: true,
        },
      },
      supabase as never,
    );

    await processSuccessfulPayment(
      {
        reference: "custom-offer-ref-1",
        amount: 15_000,
        fees: 450,
        metadata: { custom_offer_id: "offer-1" },
      },
      supabase as never,
    );

    await processSuccessfulPayment(
      {
        reference: "wallet-ref-1",
        amount: 5_000,
        metadata: { wallet_topup_id: "topup-1" },
      },
      supabase as never,
    );

    await processSuccessfulPayment(
      {
        reference: "gift-ref-1",
        amount: 5_000,
        metadata: { gift_card_order_id: "gift-order-1" },
      },
      supabase as never,
    );

    await processSuccessfulPayment(
      {
        reference: "booking-ref-2",
        amount: 4_000,
        fees: 120,
        metadata: { booking_id: "booking-second", customer_id: "customer-1" },
      },
      supabase as never,
    );

    expect(syncBookingAfterPaystackSuccess).toHaveBeenCalledWith(
      supabase,
      "booking-1",
      expect.objectContaining({ paymentReference: "booking-ref-1" }),
    );
    expect(savePaystackAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "customer-1", authorizationCode: "AUTH_1" }),
    );
    expect(finalizeCustomOfferPaymentFromPaystackEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reference: "custom-offer-ref-1" }),
    );
    expect(applyWalletTopupFromSuccessfulPaystackCharge).toHaveBeenCalledWith(
      expect.objectContaining({ reference: "wallet-ref-1" }),
      supabase,
    );
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "gift_cards" }),
        expect.objectContaining({ table: "payment_transactions" }),
        expect.objectContaining({ table: "finance_transactions" }),
      ]),
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "gift_card_orders" }),
        expect.objectContaining({ table: "bookings" }),
      ]),
    );
  });
});
