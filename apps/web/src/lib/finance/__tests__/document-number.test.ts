import { describe, expect, it, vi } from "vitest";
import {
  formatDocumentNumber,
  nextDocumentNumber,
  NEXT_DOCUMENT_NUMBER_RPC,
} from "../document-number";

function supabaseWith(opts: {
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  highWater?: string | null;
}) {
  const rpc = vi.fn(
    opts.rpc ??
      (async () => ({ data: null, error: { code: "42883", message: "function next_document_number does not exist" } })),
  );
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    like: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: opts.highWater ? { invoice_number: opts.highWater } : null, error: null }),
  };
  const from = vi.fn(() => chain);
  return { supabase: { rpc, from } as any, rpc, from };
}

describe("document numbering (F2-43)", () => {
  it("formats INV-YYYY-NNNNNN", () => {
    expect(formatDocumentNumber("INV", 2026, 7)).toBe("INV-2026-000007");
    expect(formatDocumentNumber("PAY", 2026, 123456)).toBe("PAY-2026-123456");
  });

  it("uses the gap-free DB sequence RPC when it exists", async () => {
    const { supabase, rpc, from } = supabaseWith({
      rpc: async (name, args) => {
        expect(name).toBe(NEXT_DOCUMENT_NUMBER_RPC);
        expect(args).toEqual({ p_tenant_id: "tenant-1", p_kind: "provider_invoice:2026" });
        return { data: 42, error: null };
      },
    });
    const r = await nextDocumentNumber(supabase, {
      tenantId: "tenant-1",
      kind: "provider_invoice",
      prefix: "INV",
      year: 2026,
      fallback: { table: "provider_invoices", column: "invoice_number" },
    });
    expect(r).toEqual({ number: "INV-2026-000042", sequence: 42, source: "rpc" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("falls back to high-water + 1 + attempt when the RPC is not deployed yet", async () => {
    const { supabase } = supabaseWith({ highWater: "INV-2026-000004" });
    const r0 = await nextDocumentNumber(supabase, {
      tenantId: "tenant-1",
      kind: "provider_invoice",
      prefix: "INV",
      year: 2026,
      fallback: { table: "provider_invoices", column: "invoice_number" },
    });
    expect(r0).toEqual({ number: "INV-2026-000005", sequence: 5, source: "fallback" });
    const r2 = await nextDocumentNumber(supabase, {
      tenantId: "tenant-1",
      kind: "provider_invoice",
      prefix: "INV",
      year: 2026,
      attempt: 2,
      fallback: { table: "provider_invoices", column: "invoice_number" },
    });
    expect(r2.number).toBe("INV-2026-000007");
  });

  it("surfaces unexpected RPC errors instead of silently falling back", async () => {
    const { supabase } = supabaseWith({
      rpc: async () => ({ data: null, error: { code: "P0001", message: "SEQUENCE_LOCKED" } }),
    });
    await expect(
      nextDocumentNumber(supabase, {
        tenantId: "tenant-1",
        kind: "provider_invoice",
        prefix: "INV",
        year: 2026,
        fallback: { table: "provider_invoices", column: "invoice_number" },
      }),
    ).rejects.toMatchObject({ code: "P0001" });
  });
});
