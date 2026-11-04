import { describe, expect, it, vi } from "vitest";
import { lineVatRatePercent, resolveProviderVat } from "../resolve-provider-vat";

describe("resolveProviderVat", () => {
  it("returns 0% when provider is not VAT registered", async () => {
    const supabase = {} as never;
    const r = await resolveProviderVat(supabase, { is_vat_registered: false, tax_rate_percent: 15 });
    expect(r.registered).toBe(false);
    expect(r.ratePercent).toBe(0);
  });

  it("prefers admin override percent when registered", async () => {
    const supabase = {} as never;
    const r = await resolveProviderVat(supabase, {
      is_vat_registered: true,
      tax_rate_override_percent: 14,
      tax_rate_percent: 15,
    });
    expect(r.source).toBe("override");
    expect(r.ratePercent).toBe(14);
  });

  it("falls back to platform_settings default_tax_rate when tax_rates table is unavailable", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "tax_rates") {
          // Simulate older DB snapshot where `tax_rates` relation doesn't exist.
          throw new Error('relation "tax_rates" does not exist');
        }
        if (table === "platform_settings") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: { settings: { taxes: { default_tax_rate: 15 } } },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as never;

    const r = await resolveProviderVat(supabase, {
      is_vat_registered: true,
      country_code: "ZA",
      tax_inclusive: true,
      vat_number: "4123456789",
      tax_rate_percent: null,
      tax_rate_override_percent: null,
    });
    expect(r.registered).toBe(true);
    expect(r.ratePercent).toBe(15);
    // Rate came from a default fallback, but it still behaves as the provider's
    // country-default effective rate for downstream computations.
    expect(r.source).toBe("country_default");
  });
});

describe("lineVatRatePercent", () => {
  it("returns 0 for zero_or_exempt lines", () => {
    expect(
      lineVatRatePercent(
        { registered: true, ratePercent: 15, inclusive: true, vatNumber: "x", source: "provider" },
        "zero_or_exempt",
      ),
    ).toBe(0);
  });
});
