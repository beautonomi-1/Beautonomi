import {
  bookingPaymentStatusLabel,
  customerPaymentDisplayLabel,
  customerStatusPillLabel,
} from "@/lib/customer-booking-display-labels";

describe("customerPaymentDisplayLabel", () => {
  const td = (key: string) => `T:${key}`;

  it("maps deposit partially_paid separately from generic partial", () => {
    expect(
      customerPaymentDisplayLabel(
        {
          paymentStatus: "partially_paid",
          depositRequired: true,
          paymentOption: "deposit",
        },
        td,
      ),
    ).toBe("T:depositPaid");
  });

  it("maps cash pending to pay at appointment", () => {
    expect(
      customerPaymentDisplayLabel(
        { paymentStatus: "pending", paymentProvider: "cash" },
        td,
      ),
    ).toBe("T:payAtAppointment");
  });
});

describe("bookingPaymentStatusLabel", () => {
  it("maps failed variants", () => {
    const td = (key: string) => key;
    expect(bookingPaymentStatusLabel("failed", td)).toBe("paymentFailedLabel");
    expect(bookingPaymentStatusLabel("refunded", td)).toBe("paymentStatusRefunded");
  });
});

describe("customerStatusPillLabel", () => {
  const td = (key: string) => key;
  it("uses short pill keys for confirmed", () => {
    expect(customerStatusPillLabel("confirmed", "confirmed", td)).toBe("statusPillConfirmed");
  });
});
