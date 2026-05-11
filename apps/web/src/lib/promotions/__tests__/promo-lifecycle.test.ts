import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePromoCode } from "../validate";

/**
 * Builds a Supabase mock that returns a single promo row when matched.
 * `provider` chains: from(promotions).select().eq(code).eq(is_active).eq(provider_id).maybeSingle()
 *                     from(promotions).select().eq(code).eq(is_active).is(provider_id, null).maybeSingle()
 */
function makeSupabaseMock(promo: Record<string, unknown> | null) {
  const builder = () => {
    const state: { code?: string; provider_id?: string; matchPlatform?: boolean } = {};
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: string) => {
      if (col === "code") state.code = val;
      if (col === "provider_id") state.provider_id = val;
      return chain;
    };
    chain.is = (col: string, val: unknown) => {
      if (col === "provider_id" && val === null) state.matchPlatform = true;
      return chain;
    };
    chain.maybeSingle = async () => {
      if (!promo) return { data: null };
      const promoCode = (promo.code as string | undefined) ?? "";
      const codeMatch = state.code?.toUpperCase() === promoCode.toUpperCase();
      if (!codeMatch) return { data: null };
      const promoProviderId = (promo.provider_id as string | null | undefined) ?? null;
      if (state.matchPlatform) {
        if (promoProviderId == null) return { data: promo };
        return { data: null };
      }
      if (promoProviderId != null && state.provider_id === promoProviderId) {
        return { data: promo };
      }
      return { data: null };
    };
    return chain;
  };
  return { from: () => builder() } as unknown as SupabaseClient;
}

const PROVIDER_ID = "00000000-0000-4000-8000-000000000001";

describe("promo lifecycle — canonical reasons + no stale state", () => {
  it("invalid code → valid=false with canonical reason; no discount", async () => {
    const supabase = makeSupabaseMock(null);
    const r = await validatePromoCode(supabase, {
      code: "WHATEVER",
      amount: 200,
      providerId: PROVIDER_ID,
    });
    expect(r.valid).toBe(false);
    expect(r.discount.amount).toBe(0);
    expect(r.discount.original_amount).toBe(200);
    expect(r.discount.final_amount).toBe(200);
    expect(r.message).toBeTruthy();
  });

  it("expired code → valid=false; canonical reason; no discount persists", async () => {
    const supabase = makeSupabaseMock({
      id: "p-1",
      code: "EXPIRED10",
      type: "percentage",
      value: 10,
      is_active: true,
      provider_id: PROVIDER_ID,
      end_date: new Date(Date.now() - 86400000).toISOString(),
    });
    const r = await validatePromoCode(supabase, {
      code: "EXPIRED10",
      amount: 100,
      providerId: PROVIDER_ID,
    });
    expect(r.valid).toBe(false);
    expect(r.discount.amount).toBe(0);
    expect(r.message?.toLowerCase()).toContain("expired");
  });

  it("usage-limit reached → valid=false", async () => {
    const supabase = makeSupabaseMock({
      id: "p-2",
      code: "MAXED",
      type: "percentage",
      value: 10,
      is_active: true,
      provider_id: PROVIDER_ID,
      usage_limit: 5,
      usage_count: 5,
    });
    const r = await validatePromoCode(supabase, {
      code: "MAXED",
      amount: 100,
      providerId: PROVIDER_ID,
    });
    expect(r.valid).toBe(false);
    expect(r.message?.toLowerCase()).toContain("usage limit");
    expect(r.discount.amount).toBe(0);
  });

  it("min-amount not met → valid=false", async () => {
    const supabase = makeSupabaseMock({
      id: "p-3",
      code: "BIG50",
      type: "fixed",
      value: 50,
      min_purchase_amount: 500,
      is_active: true,
      provider_id: PROVIDER_ID,
    });
    const r = await validatePromoCode(supabase, {
      code: "BIG50",
      amount: 200,
      providerId: PROVIDER_ID,
    });
    expect(r.valid).toBe(false);
    expect(r.message?.toLowerCase()).toMatch(/minimum|min/);
    expect(r.discount.amount).toBe(0);
  });

  it("valid percentage code → discount once, capped at original amount", async () => {
    const supabase = makeSupabaseMock({
      id: "p-4",
      code: "TEN",
      type: "percentage",
      value: 10,
      is_active: true,
      provider_id: PROVIDER_ID,
    });
    const r = await validatePromoCode(supabase, {
      code: "TEN",
      amount: 200,
      providerId: PROVIDER_ID,
    });
    expect(r.valid).toBe(true);
    expect(r.discount.amount).toBeCloseTo(20, 5);
    expect(r.discount.final_amount).toBeCloseTo(180, 5);
    expect(r.discount.percentage).toBe(10);
  });

  it("valid fixed code with cap → cap respected", async () => {
    const supabase = makeSupabaseMock({
      id: "p-5",
      code: "CAP",
      type: "fixed",
      value: 80,
      max_discount_amount: 50,
      is_active: true,
      provider_id: PROVIDER_ID,
    });
    const r = await validatePromoCode(supabase, {
      code: "CAP",
      amount: 200,
      providerId: PROVIDER_ID,
    });
    expect(r.valid).toBe(true);
    expect(r.discount.amount).toBe(50);
  });

  it("location-scoped promo: at_home cart cannot redeem at_salon-only promo", async () => {
    const supabase = makeSupabaseMock({
      id: "p-6",
      code: "SALONONLY",
      type: "percentage",
      value: 10,
      is_active: true,
      provider_id: PROVIDER_ID,
      location_id: "loc-1",
    });
    const r = await validatePromoCode(supabase, {
      code: "SALONONLY",
      amount: 200,
      providerId: PROVIDER_ID,
      locationType: "at_home",
      locationId: null,
    });
    expect(r.valid).toBe(false);
    expect(r.message?.toLowerCase()).toContain("location");
  });

  it("platform promo with applicable_providers excluding current → invalid", async () => {
    const supabase = makeSupabaseMock({
      id: "p-7",
      code: "PARTNER10",
      type: "percentage",
      value: 10,
      is_active: true,
      provider_id: null,
      applicable_providers: ["other-provider"],
    });
    const r = await validatePromoCode(supabase, {
      code: "PARTNER10",
      amount: 100,
      providerId: PROVIDER_ID,
    });
    expect(r.valid).toBe(false);
    expect(r.discount.amount).toBe(0);
  });

  it("subsequent invalidation never carries forward a previous discount amount", async () => {
    const supabaseValid = makeSupabaseMock({
      id: "p-8",
      code: "TEN",
      type: "percentage",
      value: 10,
      is_active: true,
      provider_id: PROVIDER_ID,
    });
    const ok = await validatePromoCode(supabaseValid, {
      code: "TEN",
      amount: 200,
      providerId: PROVIDER_ID,
    });
    expect(ok.valid).toBe(true);
    expect(ok.discount.amount).toBeGreaterThan(0);

    const supabaseInvalid = makeSupabaseMock(null);
    const bad = await validatePromoCode(supabaseInvalid, {
      code: "TEN",
      amount: 200,
      providerId: PROVIDER_ID,
    });
    expect(bad.valid).toBe(false);
    expect(bad.discount.amount).toBe(0);
    expect(bad.discount.original_amount).toBe(200);
    expect(bad.discount.final_amount).toBe(200);
  });
});
