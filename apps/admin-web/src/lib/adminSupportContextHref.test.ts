import { describe, expect, it } from "vitest";
import { adminSupportContextHrefForRole } from "./adminSupportContextHref";

describe("adminSupportContextHrefForRole", () => {
  const bookingId = "00000000-0000-4000-8000-000000000001";

  it("hides booking deep link for support_agent", () => {
    expect(adminSupportContextHrefForRole("support_agent", "booking", bookingId)).toBeNull();
  });

  it("allows booking deep link for admin_support", () => {
    expect(adminSupportContextHrefForRole("admin_support", "booking", bookingId)).toContain("/admin/bookings/");
  });

  it("hides payment refunds search for support roles", () => {
    expect(adminSupportContextHrefForRole("support_agent", "payment", bookingId)).toBeNull();
    expect(adminSupportContextHrefForRole("admin_support", "payment", bookingId)).toBeNull();
  });

  it("gates wallet bank refund deep link to finance", () => {
    expect(adminSupportContextHrefForRole("support_agent", "wallet_bank_refund", bookingId)).toBeNull();
    expect(adminSupportContextHrefForRole("admin_support", "wallet_bank_refund", bookingId)).toBeNull();
    expect(adminSupportContextHrefForRole("admin_finance", "wallet_bank_refund", bookingId)).toBe(
      `/admin/refunds?tab=bank&id=${bookingId}`,
    );
    expect(adminSupportContextHrefForRole("superadmin", "wallet_bank_refund", bookingId)).toContain("tab=bank");
  });
});
