import { describe, expect, it } from "vitest";
import {
  buildNormalizedTierOptions,
  dedupeVariantNames,
  mergePrimaryTierIntoStoredPricingOptions,
  normalizePricingOption,
  previewBookingTierName,
  shouldSyncPricingOptionVariants,
  syncVariantOfferings,
} from "./sync-variants";
import type { SupabaseClient } from "@supabase/supabase-js";

const parent = {
  id: "parent-1",
  provider_id: "prov-1",
  title: "Haircut",
  pricing_name: "Classic",
  duration_minutes: 60,
  price: 100,
  is_active: true,
};

describe("normalizePricingOption", () => {
  it("reads snake_case pricing_name from JSON", () => {
    const opt = normalizePricingOption(
      { price: 150, duration: 90, pricing_name: "Long" },
      1,
      parent,
    );
    expect(opt.pricingName).toBe("Long");
    expect(opt.variantName).toBe("Long");
  });

  it("auto-names row 0 when blank", () => {
    const opt = normalizePricingOption({ price: 100, duration: 60 }, 0, parent);
    expect(opt.variantName).toBe("Classic");
  });

  it("auto-names row 0 as Standard when parent has no pricing_name", () => {
    const opt = normalizePricingOption({ price: 100, duration: 60 }, 0, {
      duration_minutes: 60,
      price: 100,
    });
    expect(opt.variantName).toBe("Standard");
  });

  it("auto-names later rows as Option N", () => {
    const opt = normalizePricingOption({ price: 120, duration: 45 }, 2, parent);
    expect(opt.variantName).toBe("Option 3");
  });
});

describe("buildNormalizedTierOptions", () => {
  it("returns empty for single option (parent-only bookable)", () => {
    expect(buildNormalizedTierOptions([{ price: 100, duration: 60 }], parent)).toEqual([]);
  });

  it("materializes all rows when multiple tiers exist", () => {
    const tiers = buildNormalizedTierOptions(
      [
        { price: 100, duration: 60 },
        { price: 150, duration: 90 },
        { price: 200, duration: 120 },
      ],
      parent,
    );
    expect(tiers).toHaveLength(3);
    expect(tiers.map((t) => t.variantName)).toEqual(["Classic", "Option 2", "Option 3"]);
    expect(tiers.map((t) => t.sortOrder)).toEqual([0, 1, 2]);
  });

  it("uses explicit names and auto-names blanks", () => {
    const tiers = buildNormalizedTierOptions(
      [
        { price: 100, duration: 60, pricingName: "Short" },
        { price: 150, duration: 90 },
        { price: 200, duration: 120, pricingName: "Premium" },
      ],
      parent,
    );
    expect(tiers.map((t) => t.variantName)).toEqual(["Short", "Option 2", "Premium"]);
  });

  it("row 0 named + row 1 unnamed produces two bookable tiers", () => {
    const tiers = buildNormalizedTierOptions(
      [
        { price: 100, duration: 60, pricingName: "Standard" },
        { price: 150, duration: 90 },
      ],
      parent,
    );
    expect(tiers.map((t) => t.variantName)).toEqual(["Standard", "Option 2"]);
  });
});

describe("dedupeVariantNames", () => {
  it("appends suffix for duplicate names", () => {
    const input = [
      normalizePricingOption({ pricingName: "Express" }, 0, parent),
      normalizePricingOption({ pricingName: "Express" }, 1, parent),
    ];
    const deduped = dedupeVariantNames(input);
    expect(deduped.map((t) => t.variantName)).toEqual(["Express", "Express (2)"]);
  });
});

describe("previewBookingTierName", () => {
  it("matches sync naming for blank tier 1", () => {
    expect(previewBookingTierName({ price: 100, duration: 60 }, 0, "Classic")).toBe("Classic");
  });
});

describe("mergePrimaryTierIntoStoredPricingOptions", () => {
  it("returns null for single-tier services", () => {
    expect(mergePrimaryTierIntoStoredPricingOptions([{ price: 50, duration: 30 }], 75, 45)).toBeNull();
  });

  it("updates only tier 0 price and duration", () => {
    const merged = mergePrimaryTierIntoStoredPricingOptions(
      [
        { id: "1", price: 100, duration: 60, pricingName: "Standard" },
        { id: "2", price: 150, duration: 90, pricingName: "Long" },
      ],
      120,
      75,
    );
    expect(merged).toEqual([
      { id: "1", price: 120, duration: 75, pricingName: "Standard" },
      { id: "2", price: 150, duration: 90, pricingName: "Long" },
    ]);
  });
});

describe("shouldSyncPricingOptionVariants", () => {
  it("skips manual variant offerings", () => {
    expect(shouldSyncPricingOptionVariants("variant")).toBe(false);
  });

  it("syncs basic services", () => {
    expect(shouldSyncPricingOptionVariants("basic")).toBe(true);
    expect(shouldSyncPricingOptionVariants(undefined)).toBe(true);
  });
});

describe("syncVariantOfferings", () => {
  it("deactivates all child variants when only one pricing tier remains", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { id: "v1", variant_name: "Classic" },
                  { id: "v2", variant_name: "Long" },
                ],
                error: null,
              }),
          }),
        }),
        update: (data: unknown) => ({
          eq: () => Promise.resolve({ error: null }),
          in: (_col: string, ids: string[]) => {
            updates.push({ data, ids });
            return Promise.resolve({ error: null });
          },
        }),
        insert: () => Promise.resolve({ error: null }),
      }),
    } as unknown as SupabaseClient;

    const result = await syncVariantOfferings(supabase, parent, [{ price: 100, duration: 60 }]);

    expect(result.synced).toBe(0);
    expect(result.deactivated).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      data: expect.objectContaining({ is_active: false }),
      ids: ["v1", "v2"],
    });
  });

  it("creates all tiers for multi-tier services with unnamed rows", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
          in: () => Promise.resolve({ error: null }),
        }),
        insert: (data: unknown) => {
          inserts.push(data);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    const result = await syncVariantOfferings(
      supabase,
      parent,
      [
        { price: 100, duration: 60 },
        { price: 150, duration: 90 },
        { price: 200, duration: 120 },
      ],
    );

    expect(result.errors).toEqual([]);
    expect(result.created).toBe(3);
    expect(result.synced).toBe(3);
    expect(inserts.map((row: any) => row.variant_name)).toEqual([
      "Classic",
      "Option 2",
      "Option 3",
    ]);
  });

  it("reactivates an existing inactive variant by name", async () => {
    const updates: { id?: string; data?: unknown }[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "v1", variant_name: "Classic" }],
                error: null,
              }),
          }),
        }),
        update: (data: unknown) => ({
          eq: (_col: string, id: string) => {
            updates.push({ id, data });
            return Promise.resolve({ error: null });
          },
          in: () => Promise.resolve({ error: null }),
        }),
        insert: () => Promise.resolve({ error: null }),
      }),
    } as unknown as SupabaseClient;

    const result = await syncVariantOfferings(
      supabase,
      parent,
      [
        { price: 110, duration: 65 },
        { price: 150, duration: 90, pricingName: "Long" },
      ],
    );

    expect(result.updated).toBe(1);
    expect(result.created).toBe(1);
    expect(updates[0]?.data).toEqual(
      expect.objectContaining({
        variant_name: "Classic",
        price: 110,
        duration_minutes: 65,
        is_active: true,
      }),
    );
  });

  it("uses parent price when tier price is zero", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
          in: () => Promise.resolve({ error: null }),
        }),
        insert: (data: unknown) => {
          inserts.push(data);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await syncVariantOfferings(supabase, parent, [
      { price: 100, duration: 60 },
      { price: 0, duration: 90 },
    ]);

    expect((inserts[1] as { price: number }).price).toBe(100);
  });
});

describe("booking scenario matrix", () => {
  const scenarios = [
    {
      name: "single tier, no names",
      options: [{ price: 100, duration: 60 }],
      bookableTierCount: 0,
      usesParentAtBooking: true,
    },
    {
      name: "three tiers, no names",
      options: [
        { price: 100, duration: 60 },
        { price: 150, duration: 90 },
        { price: 200, duration: 120 },
      ],
      bookableTierCount: 3,
      usesParentAtBooking: false,
    },
    {
      name: "two tiers, only second named (old bug case)",
      options: [
        { price: 100, duration: 60 },
        { price: 150, duration: 90, pricingName: "Long" },
      ],
      bookableTierCount: 2,
      expectedNames: ["Classic", "Long"],
    },
    {
      name: "reduce from multi to single",
      options: [{ price: 100, duration: 60 }],
      bookableTierCount: 0,
    },
  ] as const;

  it.each(scenarios)("$name", ({ options, bookableTierCount, expectedNames }) => {
    const tiers = buildNormalizedTierOptions(options, parent);
    expect(tiers).toHaveLength(bookableTierCount);
    if (expectedNames) {
      expect(tiers.map((t) => t.variantName)).toEqual(expectedNames);
    }
  });
});
