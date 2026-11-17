import { describe, expect, it, vi } from "vitest";
import {
  lineVatRatePercent,
  providerVatSnapshotColumns,
  resolveProviderVat,
} from "../resolve-provider-vat";

describe("providerVatSnapshotColumns (F2-39)", () => {
  it("maps a registered provider to the booking/order snapshot columns", () => {
    expect(
      providerVatSnapshotColumns({
        registered: true,
        ratePercent: 15,
        inclusive: true,
        vatNumber: "4123456789",
        source: "country_default",
      }),
    ).toEqual({ tax_inclusive: true, provider_vat_number_snapshot: "4123456789" });
  });

  it("writes a null VAT number for unregistered providers", () => {
    expect(
      providerVatSnapshotColumns({
        registered: false,
        ratePercent: 0,
        inclusive: false,
        vatNumber: null,
        source: "none",
      }),
    ).toEqual({ tax_inclusive: false, provider_vat_number_snapshot: null });
  });
});

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

describe("resolveProviderVat country from tenant", () => {
  function supabaseWithTenantAndRates(regionCode: string | null, ratesByCountry: Record<string, number>) {
    const queried: string[] = [];
    const tableQuery = (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        lte: chain,
        or: chain,
        order: chain,
        limit: chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return q;
        },
        maybeSingle: async () => {
          if (table === "tenants") return { data: { region_code: regionCode }, error: null };
          const cc = filters.country_code as string | undefined;
          if (cc) {
            queried.push(cc);
            return { data: cc in ratesByCountry ? { rate: ratesByCountry[cc] } : null, error: null };
          }
          return { data: null, error: null };
        },
      });
      return q;
    };
    return { supabase: { from: tableQuery } as never, queried };
  }

  it("uses the tenant region as the provider country when the row has none", async () => {
    const { supabase, queried } = supabaseWithTenantAndRates("za", { ZA: 15 });
    const r = await resolveProviderVat(supabase, {
      is_vat_registered: true,
      tenant_id: "tenant-1",
      tax_rate_override_percent: null,
    });
    expect(queried).toEqual(["ZA"]);
    expect(r).toMatchObject({ registered: true, ratePercent: 15, source: "country_default", countryCode: "ZA" });
  });

  it("prefers an explicit country over the tenant", async () => {
    const { supabase, queried } = supabaseWithTenantAndRates("ZA", { KE: 16 });
    const r = await resolveProviderVat(supabase, {
      is_vat_registered: true,
      country_code: "ke",
      tenant_id: "tenant-1",
    });
    expect(queried).toEqual(["KE"]);
    expect(r.ratePercent).toBe(16);
    expect(r.countryCode).toBe("KE");
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
