import {
  getCalendarPaymentLabel,
  paymentNeedsAttention,
} from "@/lib/calendar-payment-label";
import type { TFunction } from "@beautonomi/i18n";

const t = ((key: string) => {
  const map: Record<string, string> = {
    "provider.calendarScreen.paymentChip.paid": "Paid",
    "provider.calendarScreen.paymentChip.partPaid": "Partially paid",
    "provider.calendarScreen.paymentChip.paymentDue": "Payment due",
  };
  return map[key] ?? key;
}) as TFunction;

describe("getCalendarPaymentLabel", () => {
  it("returns paid label when payment_status is paid", () => {
    expect(
      getCalendarPaymentLabel({ payment_status: "paid", total_amount: 100, total_paid: 0 }, t),
    ).toBe("Paid");
  });

  it("returns paid label when total is covered by total_paid", () => {
    expect(
      getCalendarPaymentLabel({ payment_status: "pending", total_amount: 100, total_paid: 100 }, t),
    ).toBe("Paid");
  });

  it("returns part-paid when some but not all is paid", () => {
    expect(
      getCalendarPaymentLabel({ total_amount: 100, total_paid: 40, payment_status: "pending" }, t),
    ).toBe("Partially paid");
  });

  it("returns payment due for unpaid with amount", () => {
    expect(
      getCalendarPaymentLabel({ total_amount: 50, total_paid: 0, payment_status: "unpaid" }, t),
    ).toBe("Payment due");
  });

  it("returns null when nothing is owed and not explicitly due", () => {
    expect(getCalendarPaymentLabel({ total_amount: 0, total_paid: 0 }, t)).toBeNull();
  });
});

describe("paymentNeedsAttention", () => {
  it("is false when status is paid or fully covered", () => {
    expect(paymentNeedsAttention({ payment_status: "paid" })).toBe(false);
    expect(paymentNeedsAttention({ payment_status: "completed" })).toBe(false);
    expect(paymentNeedsAttention({ total_amount: 100, total_paid: 100 })).toBe(false);
  });

  it("is true for partial payment or pending/unpaid with balance", () => {
    expect(paymentNeedsAttention({ total_amount: 100, total_paid: 30 })).toBe(true);
    expect(paymentNeedsAttention({ payment_status: "pending", total_amount: 10 })).toBe(true);
    expect(paymentNeedsAttention({ payment_status: "unpaid", total_amount: 0 })).toBe(true);
  });
});
