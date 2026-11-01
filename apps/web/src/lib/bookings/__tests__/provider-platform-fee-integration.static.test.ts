import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("provider platform fee — integration wiring (static)", () => {
  it("clears legacy fee on every later-money rail in the plan", () => {
    const paths = [
      "app/api/provider/bookings/[id]/mark-paid/route.ts",
      "lib/bookings/send-booking-payment-link.ts",
      "app/api/me/bookings/[id]/pay-remaining/route.ts",
      "lib/payments/settle-card-machine-payment.ts",
      "app/api/provider/paystack/terminal-payments/route.ts",
      "app/api/provider/bookings/[id]/send-payment-link/route.ts",
    ];
    for (const p of paths) {
      expect(read(p), p).toContain("clearUncollectedProviderPortalPlatformFeeIfNeeded");
    }
  });

  it("till ledger migration zeroes platform fee on provider-collected paths", () => {
    const sql = readFileSync(
      join(process.cwd(), "../../supabase/migrations/1027_provider_portal_till_no_platform_fee.sql"),
      "utf8",
    );
    expect(sql).toContain("create_finance_ledger_from_payment");
    expect(sql).toMatch(/booking_source IN \('provider', 'walk_in'\)/);
    expect(sql).toContain("v_pf := 0");
  });

  it("public online checkout still stores quoted platform fee", () => {
    const create = read("app/api/public/bookings/_helpers/create-booking-record.ts");
    expect(create).toContain("platform_fee_amount: v.serviceFeeAmount");
    expect(create).toMatch(/booking_source.*online/s);
  });
});
