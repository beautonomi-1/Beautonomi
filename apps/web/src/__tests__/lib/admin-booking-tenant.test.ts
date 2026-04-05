import { describe, it, expect, vi } from "vitest";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";

describe("fetchBookingInAdminTenant", () => {
  it("returns 403-style error when booking tenant_id mismatches", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "b1", tenant_id: "tenant-other" },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const r = await fetchBookingInAdminTenant(
      supabase as never,
      "b1",
      "tenant-expected",
      "id, tenant_id"
    );

    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error.status).toBe(403);
    }
  });

  it("returns not found when booking missing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const r = await fetchBookingInAdminTenant(
      supabase as never,
      "missing",
      "tenant-expected",
      "id"
    );

    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error.status).toBe(404);
    }
  });
});
