import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertNotification = vi.fn();
const mockSendTemplateNotification = vi.fn();

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: (...args: unknown[]) => mockInsertNotification(...args),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: (...args: unknown[]) => mockSendTemplateNotification(...args),
}));

vi.mock("@/lib/money/tenant-intl-format", () => ({
  getTenantMoneyFormatter: async () => ({ format: (n: number) => `R ${n.toFixed(2)}` }),
}));

import { sendBookingPaymentLink } from "../send-booking-payment-link";

function buildSupabase(contact: { email?: string | null; phone?: string | null } | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: contact, error: null }),
    })),
  } as any;
}

const BOOKING_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";

describe("sendBookingPaymentLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertNotification.mockResolvedValue(undefined);
    mockSendTemplateNotification.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test/";
  });

  it("sends the link on every channel the customer can receive", async () => {
    const result = await sendBookingPaymentLink(
      buildSupabase({ email: "guest@example.com", phone: "+27821234567" }),
      {
        bookingId: BOOKING_ID,
        bookingRef: "BK-1001",
        customerId: CUSTOMER_ID,
        tenantId: "tenant-1",
        source: "provider_group_booking_create",
        amounts: { totalAmount: 450, paymentStatus: "pending" },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.amountDue).toBe(450);
    // Trailing slash on the app URL must not produce a double slash.
    expect(result.paymentLink).toBe(`https://app.test/bookings/${BOOKING_ID}/pay`);
    expect(result.warnings).toEqual([]);

    expect(mockInsertNotification).toHaveBeenCalledTimes(1);
    expect(mockInsertNotification.mock.calls[0][0]).toMatchObject({
      user_id: CUSTOMER_ID,
      type: "payment_link_sent",
      action_url: result.paymentLink,
      data: { booking_id: BOOKING_ID, source: "provider_group_booking_create", amount: 450 },
    });

    const [, recipients, vars, channels] = mockSendTemplateNotification.mock.calls[0];
    expect(recipients).toEqual([CUSTOMER_ID]);
    expect(vars).toMatchObject({ booking_number: "BK-1001", payment_link: result.paymentLink });
    expect(channels).toEqual(["push", "email", "sms"]);
  });

  it("falls back to push only when the customer has no email or phone", async () => {
    await sendBookingPaymentLink(buildSupabase({ email: null, phone: null }), {
      bookingId: BOOKING_ID,
      bookingRef: "BK-1002",
      customerId: CUSTOMER_ID,
      tenantId: null,
      source: "provider_booking_create",
      amounts: { totalAmount: 100 },
    });

    expect(mockSendTemplateNotification.mock.calls[0][3]).toEqual(["push"]);
  });

  it("nets prior settlement off the amount due without double-counting wallet credits", async () => {
    // total_paid already includes the wallet/gift synthetic payments (migration
    // 582), so coverage is the larger of the two estimates — never their sum.
    const result = await sendBookingPaymentLink(buildSupabase({ email: "a@b.c" }), {
      bookingId: BOOKING_ID,
      bookingRef: "BK-1003",
      customerId: CUSTOMER_ID,
      tenantId: "tenant-1",
      source: "provider_booking_create",
      amounts: {
        totalAmount: 500,
        totalPaid: 100,
        walletAmount: 50,
        giftCardAmount: 25,
        paymentStatus: "partially_paid",
      },
    });

    expect(result.amountDue).toBe(400);
  });

  it("uses legacy wallet/gift coverage when no payment rows were ever recorded", async () => {
    const result = await sendBookingPaymentLink(buildSupabase({ email: "a@b.c" }), {
      bookingId: BOOKING_ID,
      bookingRef: "BK-1003b",
      customerId: CUSTOMER_ID,
      tenantId: "tenant-1",
      source: "provider_booking_create",
      amounts: {
        totalAmount: 500,
        totalPaid: 0,
        walletAmount: 120,
        giftCardAmount: 30,
        paymentStatus: "partially_paid",
      },
    });

    expect(result.amountDue).toBe(350);
  });

  it("warns when there is no app URL to build an absolute link from", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const result = await sendBookingPaymentLink(buildSupabase({ phone: "+27821234567" }), {
      bookingId: BOOKING_ID,
      bookingRef: "BK-1003c",
      customerId: CUSTOMER_ID,
      tenantId: "tenant-1",
      source: "provider_booking_create",
      amounts: { totalAmount: 200 },
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/full web address/i);
  });

  it("does not send anything when nothing is owed", async () => {
    const result = await sendBookingPaymentLink(buildSupabase({ email: "a@b.c" }), {
      bookingId: BOOKING_ID,
      bookingRef: "BK-1004",
      customerId: CUSTOMER_ID,
      tenantId: "tenant-1",
      source: "provider_booking_create",
      amounts: { totalAmount: 200, totalPaid: 200, paymentStatus: "paid" },
    });

    expect(result.ok).toBe(false);
    expect(mockInsertNotification).not.toHaveBeenCalled();
    expect(mockSendTemplateNotification).not.toHaveBeenCalled();
  });

  it("reports a warning instead of throwing when delivery fails", async () => {
    mockSendTemplateNotification.mockRejectedValueOnce(new Error("onesignal 500"));

    const result = await sendBookingPaymentLink(buildSupabase({ email: "a@b.c" }), {
      bookingId: BOOKING_ID,
      bookingRef: "BK-1005",
      customerId: CUSTOMER_ID,
      tenantId: "tenant-1",
      source: "provider_booking_create",
      amounts: { totalAmount: 120 },
    });

    // The in-app bell row still landed, so the link exists — only delivery is unconfirmed.
    expect(result.ok).toBe(true);
    expect(mockInsertNotification).toHaveBeenCalledTimes(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/delivery could not be confirmed/i);
  });

  it("reports a warning when the notification itself cannot be written", async () => {
    mockInsertNotification.mockRejectedValueOnce(new Error("db down"));

    const result = await sendBookingPaymentLink(buildSupabase({ email: "a@b.c" }), {
      bookingId: BOOKING_ID,
      bookingRef: "BK-1006",
      customerId: CUSTOMER_ID,
      tenantId: "tenant-1",
      source: "provider_booking_create",
      amounts: { totalAmount: 120 },
    });

    expect(result.ok).toBe(false);
    expect(result.warnings[0]).toMatch(/could not be sent automatically/i);
  });
});
