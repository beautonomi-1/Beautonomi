import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateProviderInvoice } from "../generate-provider-invoice";

type Row = Record<string, unknown>;

/**
 * Minimal PostgREST-shaped double. Each table gets a canned read result and
 * records writes, which is enough to assert the billing decisions this helper
 * makes without standing up a database.
 */
function makeSupabase(options: {
  provider?: Row | null;
  bookings?: Row[];
  existingScheduledInvoice?: Row | null;
  lastInvoiceNumber?: string | null;
  /** Number of leading inserts that should fail with a unique violation. */
  invoiceNumberCollisions?: number;
}) {
  const inserted: Row[] = [];
  let collisionsLeft = options.invoiceNumberCollisions ?? 0;

  const from = vi.fn((table: string) => {
    if (table === "providers") {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: options.provider === undefined ? { id: "p1", timezone: "Africa/Johannesburg", currency: "ZAR" } : options.provider,
          error: options.provider === null ? { message: "not found" } : null,
        }),
      };
      return chain;
    }

    if (table === "bookings") {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: async () => ({ data: options.bookings ?? [], error: null }),
      };
      return chain;
    }

    if (table === "platform_fee_config" || table === "platform_settings") {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    }

    if (table === "provider_invoices") {
      const chain: any = {
        select: (_cols?: string) => chain,
        eq: () => chain,
        like: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          // Two different lookups hit this table: the scheduled-duplicate probe
          // and the invoice-number high-water read.
          if (options.existingScheduledInvoice !== undefined && inserted.length === 0) {
            return { data: options.existingScheduledInvoice, error: null };
          }
          return {
            data: options.lastInvoiceNumber ? { invoice_number: options.lastInvoiceNumber } : null,
            error: null,
          };
        },
        insert: (row: Row) => ({
          select: () => ({
            single: async () => {
              if (collisionsLeft > 0) {
                collisionsLeft--;
                return { data: null, error: { code: "23505", message: "duplicate key" } };
              }
              inserted.push(row);
              return { data: { id: "inv-1", ...row }, error: null };
            },
          }),
        }),
        single: async () => ({ data: { id: "inv-1", ...inserted[0] }, error: null }),
      };
      return chain;
    }

    if (table === "provider_invoice_line_items") {
      return { insert: async () => ({ error: null }) } as any;
    }

    if (table === "finance_transactions") {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: async () => ({ data: [], error: null }),
      };
      return chain;
    }

    throw new Error(`unexpected table ${table}`);
  });

  return { supabase: { from } as unknown as SupabaseClient, inserted };
}

const PERIOD = { periodStart: "2026-08-01", periodEnd: "2026-08-31" };

describe("generateProviderInvoice", () => {
  it("bills the platform fee stamped on each completed booking", async () => {
    const { supabase, inserted } = makeSupabase({
      bookings: [
        { id: "b1", ref_number: "BK-1", total_amount: 1000, platform_fee_amount: 150 },
        { id: "b2", ref_number: "BK-2", total_amount: 500, platform_fee_amount: 75 },
      ],
    });

    const { invoice } = await generateProviderInvoice(supabase, {
      providerId: "p1",
      ...PERIOD,
      invoiceType: "platform_fee",
    });

    expect(invoice).toBeTruthy();
    expect(inserted[0].subtotal).toBe(225);
    expect(inserted[0].currency).toBe("ZAR");
  });

  it("falls back to the default commission rate when no fee is stamped", async () => {
    const { supabase, inserted } = makeSupabase({
      bookings: [{ id: "b1", ref_number: "BK-1", total_amount: 1000, platform_fee_amount: 0 }],
    });

    await generateProviderInvoice(supabase, { providerId: "p1", ...PERIOD });

    expect(inserted[0].subtotal).toBe(150);
  });

  it("does not open a zero-value invoice for a scheduled run with no activity", async () => {
    const { supabase, inserted } = makeSupabase({ bookings: [] });

    const result = await generateProviderInvoice(supabase, {
      providerId: "p1",
      ...PERIOD,
      generatedBy: "scheduled",
      skipIfEmpty: true,
    });

    expect(result.skipped).toBe("no_billable_activity");
    expect(result.invoice).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("is idempotent per period so a cron re-run does not double-bill", async () => {
    const { supabase, inserted } = makeSupabase({
      existingScheduledInvoice: { id: "inv-existing" },
      bookings: [{ id: "b1", total_amount: 1000, platform_fee_amount: 150 }],
    });

    const result = await generateProviderInvoice(supabase, {
      providerId: "p1",
      ...PERIOD,
      generatedBy: "scheduled",
      skipIfEmpty: true,
    });

    expect(result.skipped).toBe("already_exists");
    expect(inserted).toHaveLength(0);
  });

  it("retries past a colliding invoice number rather than failing the run", async () => {
    const { supabase, inserted } = makeSupabase({
      bookings: [{ id: "b1", total_amount: 1000, platform_fee_amount: 150 }],
      lastInvoiceNumber: "INV-2026-000004",
      invoiceNumberCollisions: 2,
    });

    await generateProviderInvoice(supabase, { providerId: "p1", ...PERIOD });

    // Sequence 5 and 6 collided; 7 is the first free slot.
    expect(inserted[0].invoice_number).toBe("INV-2026-000007");
  });

  it("rejects an unknown provider", async () => {
    const { supabase } = makeSupabase({ provider: null });

    await expect(
      generateProviderInvoice(supabase, { providerId: "nope", ...PERIOD }),
    ).rejects.toThrow("Provider not found");
  });
});
