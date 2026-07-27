import { describe, expect, it } from "vitest";
import {
  bookingShareModelFromCustomerReceipt,
  bookingShareModelFromProviderReceipt,
  formatReceiptShareText,
  orderShareModelFromReceipt,
} from "../index";

describe("formatReceiptShareText", () => {
  it("includes all non-zero money lines and line items", () => {
    const model = bookingShareModelFromCustomerReceipt({
      booking_number: "B-100",
      status: "confirmed",
      payment_status: "paid",
      service_date: "2026-07-26T10:00:00.000Z",
      currency: "ZAR",
      customer: { full_name: "Jane Doe" },
      provider: { business_name: "Glow Salon" },
      services: [{ name: "Haircut", quantity: 1, price: 200, total: 200 }],
      addons: [{ name: "Deep conditioning", quantity: 1, price: 50, total: 50 }],
      subtotal: 250,
      tax: 37.5,
      travel_fee: 30,
      tip_amount: 20,
      total: 337.5,
      amount_paid: 337.5,
      balance_due: 0,
      transactions: [
        { amount: 337.5, payment_method: "card", payment_provider: "paystack", status: "completed" },
      ],
    });
    const text = formatReceiptShareText(model);
    expect(text).toContain("Booking #B-100");
    expect(text).toContain("Haircut");
    expect(text).toContain("Deep conditioning");
    expect(text).toContain("Tax:");
    expect(text).toContain("Travel fee:");
    expect(text).toContain("Tip:");
    expect(text).toContain("Total:");
    expect(text).toContain("Paid via:");
    expect(text).not.toContain("Balance due:");
  });

  it("suppresses provider-only fields for customer audience", () => {
    const model = bookingShareModelFromProviderReceipt({
      invoice_number: "B-200",
      currency: "ZAR",
      total_amount: 100,
      provider: { name: "Salon" },
      customer: { name: "Client" },
      items: [{ description: "Cut", quantity: 1, unit_price: 100, total: 100 }],
      referral_source_name: "Instagram",
      booking_source: "provider",
      notes: "Internal note",
      group_participants: [{ participant_name: "Guest 1" }],
    });
    const text = formatReceiptShareText(model);
    expect(text).toContain("Client source: Instagram");
    expect(text).toContain("Internal note");
    expect(text).toContain("Guest 1");

    const customerModel = { ...model, audience: "customer" as const };
    const customerText = formatReceiptShareText(customerModel);
    expect(customerText).not.toContain("Client source:");
    expect(customerText).not.toContain("Internal note");
    expect(customerText).not.toContain("Guest 1");
  });

  it("includes order fulfillment and tracking", () => {
    const model = orderShareModelFromReceipt(
      {
        order_number: "O-55",
        status: "shipped",
        payment_status: "paid",
        order_date: "2026-07-20T12:00:00.000Z",
        currency: "ZAR",
        fulfillment_type: "delivery",
        provider: { business_name: "Beauty Shop" },
        customer: { full_name: "Sam" },
        items: [{ name: "Shampoo", quantity: 2, price: 80, line_total: 160 }],
        subtotal: 160,
        tax: 24,
        delivery_fee: 40,
        total: 224,
        amount_paid: 224,
        tracking_number: "TRK123",
        carrier: "FastCourier",
        tracking_url: "https://track.example/trk123",
      },
      { audience: "customer", deepLink: "https://app.example/orders/abc" },
    );
    const text = formatReceiptShareText(model);
    expect(text).toContain("Order #O-55");
    expect(text).toContain("Shampoo");
    expect(text).toContain("2 ×");
    expect(text).toContain("Tracking:");
    expect(text).toContain("TRK123");
    expect(text).toContain("View online:");
  });

  it("includes wallet-only partial payment in Paid via", () => {
    const model = orderShareModelFromReceipt(
      {
        order_number: "O-WAL",
        status: "pending",
        payment_status: "pending",
        order_date: "2026-07-20T12:00:00.000Z",
        currency: "ZAR",
        provider: { business_name: "Beauty Shop" },
        items: [{ name: "Serum", quantity: 1, price: 100, line_total: 100 }],
        subtotal: 100,
        total: 100,
        wallet_amount: 40,
        amount_paid: 40,
        balance_due: 60,
      },
      { audience: "customer" },
    );
    const text = formatReceiptShareText(model);
    expect(text).toContain("Paid via:");
    expect(text).toContain("Wallet");
    expect(text).toContain("Balance due:");
  });
});
