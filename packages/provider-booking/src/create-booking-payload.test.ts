import { describe, expect, it } from "vitest";
import {
  resolveCreateBookingDepositFlags,
  resolvePostCreateCollectMethod,
  resolveCreateBookingCardChargeTotal,
  buildCreateBookingRawPayload,
} from "./create-booking-payload";

describe("create booking payload helpers", () => {
  it("sets deposit flags when collect deposit is enabled", () => {
    expect(resolveCreateBookingDepositFlags(true, 200)).toEqual({
      deposit_required: true,
      deposit_percentage: 50,
      payment_option: "deposit",
    });
    expect(resolveCreateBookingDepositFlags(true, 200, 30)).toEqual({
      deposit_required: true,
      deposit_percentage: 30,
      payment_option: "deposit",
    });
    expect(resolveCreateBookingDepositFlags(false, 200)).toEqual({});
  });

  it("resolves terminal post-create collect methods", () => {
    expect(resolvePostCreateCollectMethod("paycloud_terminal", 100)).toBe("paycloud");
    expect(resolvePostCreateCollectMethod("yoco_pos", 50)).toBe("yoco");
    expect(resolvePostCreateCollectMethod("paystack_terminal", 80)).toBe("paystack");
    expect(resolvePostCreateCollectMethod("cash", 80)).toBeNull();
    expect(resolvePostCreateCollectMethod("yoco_pos", 0)).toBeNull();
  });

  it("charges deposit amount on terminal when collect deposit is enabled", () => {
    expect(resolveCreateBookingCardChargeTotal("yoco_pos", 200, true, 50)).toBe(100);
    expect(resolveCreateBookingCardChargeTotal("yoco_pos", 200, false, 50)).toBe(200);
    expect(resolveCreateBookingCardChargeTotal("cash", 200, true, 50)).toBe(0);
  });

  it("builds walk-in create payload with deposit and forms", () => {
    const payload = buildCreateBookingRawPayload({
      clientName: "Jane Doe",
      clientId: "client-1",
      staffId: "staff-1",
      staffName: "Alex",
      date: "2026-07-29",
      startTime: "10:00",
      durationMinutes: 60,
      primaryServiceId: "svc-1",
      primaryServiceName: "Cut & blowdry",
      primaryPrice: 350,
      appointmentKind: "walk_in",
      selectedServices: [
        { id: "line-1", serviceId: "svc-1", serviceName: "Cut & blowdry", price: 350, duration: 60 },
      ],
      selectedProducts: [],
      paymentMethod: "cash",
      sendNotification: false,
      collectDeposit: true,
      depositPercentage: 30,
      discountAmount: 0,
      subtotal: 350,
      taxAmount: 0,
      totalAmount: 350,
      intakeResponses: { form1: { q1: "yes" } },
    });

    expect(payload.booking_source).toBe("walk_in");
    expect(payload.send_notification).toBe(false);
    expect(payload.deposit_required).toBe(true);
    expect(payload.deposit_percentage).toBe(30);
    expect(payload.provider_form_responses).toEqual({ form1: { q1: "yes" } });
  });

  it("builds at-home payload with address fields", () => {
    const payload = buildCreateBookingRawPayload({
      clientName: "Sam",
      staffId: "staff-2",
      staffName: "Bo",
      date: "2026-07-30",
      startTime: "14:30",
      durationMinutes: 90,
      primaryPrice: 500,
      appointmentKind: "at_home",
      selectedServices: [
        { id: "line-1", serviceId: "svc-2", serviceName: "Mobile facial", price: 500, duration: 90 },
      ],
      selectedProducts: [],
      paymentMethod: "pay_later",
      sendNotification: true,
      collectDeposit: false,
      discountAmount: 0,
      subtotal: 500,
      taxAmount: 0,
      totalAmount: 550,
      atHomeAddress: {
        addressLine1: "12 Main Rd",
        addressCity: "Cape Town",
        addressPostalCode: "8001",
        addressCountry: "ZA",
        travelFee: 50,
      },
    });

    expect(payload.location_type).toBe("at_home");
    expect(payload.address_line1).toBe("12 Main Rd");
    expect(payload.travel_fee).toBe(50);
    expect(payload.deposit_required).toBeUndefined();
  });

  it("maps service addons in create payload", () => {
    const payload = buildCreateBookingRawPayload({
      clientName: "Alex",
      staffId: "staff-1",
      staffName: "Sam",
      date: "2026-07-29",
      startTime: "09:00",
      durationMinutes: 75,
      primaryPrice: 300,
      appointmentKind: "in_salon",
      selectedServices: [
        {
          id: "line-1",
          serviceId: "svc-1",
          serviceName: "Style",
          price: 250,
          duration: 60,
          addons: [{ addonId: "ao-1", price: 50, duration: 15 }],
        },
      ],
      selectedProducts: [],
      paymentMethod: "pay_later",
      sendNotification: true,
      collectDeposit: false,
      discountAmount: 0,
      subtotal: 300,
      taxAmount: 0,
      totalAmount: 300,
    });

    const services = payload.services as Array<Record<string, unknown>>;
    expect(services[0]?.add_on_ids).toEqual(["ao-1"]);
    expect(services[0]?.duration_minutes).toBe(75);
    expect(services[0]?.price).toBe(300);
  });
});
