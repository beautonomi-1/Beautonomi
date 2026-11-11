import { describe, expect, it } from "vitest";
import { expectedPersistedBookingTotal } from "@beautonomi/utils";
import {
  waitlistBookingMoney,
  waitlistBookingRpcInsertMoney,
} from "../waitlist-booking-financials";

const vatIncl = {
  registered: true,
  ratePercent: 15,
  inclusive: true,
  vatNumber: "4123456789",
  source: "provider" as const,
};

const vatExcl = {
  registered: true,
  ratePercent: 15,
  inclusive: false,
  vatNumber: "4123456789",
  source: "provider" as const,
};

describe("waitlistBookingMoney", () => {
  it("VAT-inclusive offering price is subtotal and total (F2-13)", () => {
    const row = waitlistBookingMoney({
      servicePrice: 318.33,
      currency: "ZAR",
      vat: vatIncl,
    });
    expect(row.subtotal).toBe(318.33);
    expect(row.total_amount).toBe(318.33);
    expect(row.tax_inclusive).toBe(true);
    expect(row.tax_amount).toBeGreaterThan(0);
    expect(row.provider_vat_number_snapshot).toBe("4123456789");
    expect(
      expectedPersistedBookingTotal({
        subtotal: row.subtotal,
        taxAmount: row.tax_amount,
        taxInclusive: row.tax_inclusive,
      }),
    ).toBe(row.total_amount);
  });

  it("VAT-exclusive adds tax onto total", () => {
    const row = waitlistBookingMoney({
      servicePrice: 100,
      currency: "ZAR",
      vat: vatExcl,
    });
    expect(row.subtotal).toBe(100);
    expect(row.tax_amount).toBe(15);
    expect(row.total_amount).toBe(115);
    expect(row.tax_inclusive).toBe(false);
    expect(
      expectedPersistedBookingTotal({
        subtotal: row.subtotal,
        taxAmount: row.tax_amount,
        taxInclusive: false,
      }),
    ).toBe(115);
  });

  it("RPC insert carries exclusive tax_inclusive (10143)", () => {
    const row = waitlistBookingMoney({
      servicePrice: 100,
      currency: "ZAR",
      vat: vatExcl,
    });
    const insert = waitlistBookingRpcInsertMoney(row);
    expect(insert.subtotal).toBe(100);
    expect(insert.tax_amount).toBe(15);
    expect(insert.total_amount).toBe(115);
    expect(insert.tax_inclusive).toBe(false);
    expect(
      expectedPersistedBookingTotal({
        subtotal: insert.subtotal,
        taxAmount: insert.tax_amount,
        taxInclusive: insert.tax_inclusive,
      }),
    ).toBe(115);
  });
});
