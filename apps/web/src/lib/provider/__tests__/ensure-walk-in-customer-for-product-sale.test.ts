import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureWalkInCustomerLinkedForProductSale } from "../ensure-walk-in-customer-for-product-sale";

const mockHasActivity = vi.fn();
vi.mock("@/lib/provider/client-access", () => ({
  hasProviderCustomerActivityRelationship: (...args: unknown[]) => mockHasActivity(...args),
}));

function asAdmin(m: object): SupabaseClient {
  return m as unknown as SupabaseClient;
}

describe("ensureWalkInCustomerLinkedForProductSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasActivity.mockResolvedValue(false);
  });

  it("fails when both name and phone are empty", async () => {
    const admin = asAdmin({ rpc: vi.fn(), from: vi.fn() });
    const r = await ensureWalkInCustomerLinkedForProductSale({
      supabaseAdmin: admin,
      providerId: "p1",
      staffUserId: "s1",
      walletCurrency: "ZAR",
      customerName: "   ",
      customerPhone: null,
    });
    expect(r).toEqual({
      ok: false,
      message: "Customer name or phone is required to save to your client list.",
      code: "VALIDATION_ERROR",
    });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("creates user via RPC and inserts provider_clients with manual_new_customer", async () => {
    const newId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const pcInsert = vi.fn(async () => ({ error: null }));
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: { success: true, user_id: newId }, error: null }),
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === "provider_clients") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: pcInsert,
          };
        }
        return {};
      }),
    };

    const r = await ensureWalkInCustomerLinkedForProductSale({
      supabaseAdmin: asAdmin(admin),
      providerId: "p1",
      staffUserId: "staff-1",
      walletCurrency: "ZAR",
      customerName: "POS Customer",
      customerPhone: null,
    });

    expect(r).toEqual({ ok: true, customerId: newId });
    expect(pcInsert).toHaveBeenCalledTimes(1);
    const row = pcInsert.mock.calls[0][0];
    expect(row.relationship_source).toBe("manual_new_customer");
    expect(row.privacy_level).toBe("standard");
    expect(row.source_metadata.linked_via).toBe("walk_in_product_sale");
    expect(mockHasActivity).not.toHaveBeenCalled();
  });

  it("matches existing user by phone and uses limited privacy when no activity", async () => {
    const existingId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mockHasActivity.mockResolvedValue(false);
    const pcInsert = vi.fn(async () => ({ error: null }));
    const admin = {
      rpc: vi.fn(),
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [{ id: existingId }], error: null })),
              })),
            })),
          };
        }
        if (table === "provider_clients") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: pcInsert,
          };
        }
        return {};
      }),
    };

    const wrapped = asAdmin(admin);
    const r = await ensureWalkInCustomerLinkedForProductSale({
      supabaseAdmin: wrapped,
      providerId: "p1",
      staffUserId: "staff-1",
      walletCurrency: "ZAR",
      customerName: null,
      customerPhone: "+27821234567",
    });

    expect(r).toEqual({ ok: true, customerId: existingId });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mockHasActivity).toHaveBeenCalledWith(wrapped, "p1", existingId);
    const row = pcInsert.mock.calls[0][0];
    expect(row.relationship_source).toBe("manual_existing_platform");
    expect(row.privacy_level).toBe("limited");
  });

  it("treats duplicate provider_clients insert (23505) as success", async () => {
    const newId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const pcInsert = vi.fn(async () => ({ error: { code: "23505", message: "duplicate" } }));
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: { success: true, user_id: newId }, error: null }),
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === "provider_clients") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: pcInsert,
          };
        }
        return {};
      }),
    };

    const r = await ensureWalkInCustomerLinkedForProductSale({
      supabaseAdmin: asAdmin(admin),
      providerId: "p1",
      staffUserId: "staff-1",
      walletCurrency: "ZAR",
      customerName: "Dup",
      customerPhone: null,
    });
    expect(r).toEqual({ ok: true, customerId: newId });
  });
});
