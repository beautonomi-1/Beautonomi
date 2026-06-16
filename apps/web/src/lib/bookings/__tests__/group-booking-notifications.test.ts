import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const PRIMARY_USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GUEST_USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const mockSendToUser = vi.fn();
const mockEnqueueMultiChannel = vi.fn();
const mockInsertNotification = vi.fn();
const mockGetGroupBooking = vi.fn();
const mockSendResendEmail = vi.fn();

vi.mock("@/lib/notifications/onesignal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/onesignal")>();
  return {
    ...actual,
    sendToUser: (...args: unknown[]) => mockSendToUser(...args),
  };
});

vi.mock("@/lib/notifications/enqueue", () => ({
  enqueueMultiChannel: (...args: unknown[]) => mockEnqueueMultiChannel(...args),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: (...args: unknown[]) => mockInsertNotification(...args),
}));

vi.mock("@/lib/bookings/group-booking", () => ({
  getGroupBooking: (...args: unknown[]) => mockGetGroupBooking(...args),
}));

vi.mock("@/lib/integrations/resend", () => ({
  sendResendEmail: (...args: unknown[]) => mockSendResendEmail(...args),
}));

function buildSupabaseMock() {
  const bookingRow = {
    id: BOOKING_ID,
    booking_number: "1001",
    scheduled_at: "2026-06-20T10:00:00.000Z",
    provider_id: "provider-1",
    location_type: "at_salon",
    tenant_id: "tenant-1",
  };
  const providerRow = { business_name: "Test Salon", slug: "test-salon" };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: bookingRow, error: null }),
            }),
          }),
        };
      }
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: providerRow, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("sendGroupBookingNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendToUser.mockResolvedValue({ success: true });
    mockEnqueueMultiChannel.mockResolvedValue(undefined);
    mockInsertNotification.mockResolvedValue(undefined);
    mockGetGroupBooking.mockResolvedValue({
      participants: [
        {
          participant_name: "Jane Doe",
          participant_email: null,
          participant_phone: null,
          is_primary_contact: true,
          customer_id: PRIMARY_USER,
        },
        {
          participant_name: "Emily Doe",
          participant_email: null,
          participant_phone: null,
          is_primary_contact: false,
          customer_id: GUEST_USER,
        },
      ],
    });
  });

  it("sends push and enqueues durable email/SMS for registered guests", async () => {
    const { sendGroupBookingNotifications } = await import("../group-booking-notifications");
    const supabase = buildSupabaseMock();

    await sendGroupBookingNotifications(supabase as never, BOOKING_ID, GROUP_ID, {
      skipPrimaryContact: true,
    });

    expect(mockSendToUser).toHaveBeenCalledTimes(1);
    expect(mockSendToUser).toHaveBeenCalledWith(
      GUEST_USER,
      expect.objectContaining({
        type: "group_booking_confirmation",
        data: expect.objectContaining({
          group_booking_id: GROUP_ID,
          group_booking: true,
        }),
      }),
      ["push"],
      { appType: "customer" },
    );

    expect(mockEnqueueMultiChannel).toHaveBeenCalledTimes(1);
    expect(mockEnqueueMultiChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "group_booking_confirmation",
        recipientUserId: GUEST_USER,
      }),
      ["email", "sms"],
      expect.stringContaining(GUEST_USER),
    );

    expect(mockInsertNotification).toHaveBeenCalledTimes(1);
    expect(mockInsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: GUEST_USER,
        type: "group_booking_confirmation",
      }),
    );
  });

  it("skips the primary contact when skipPrimaryContact is set", async () => {
    const { sendGroupBookingNotifications } = await import("../group-booking-notifications");
    const supabase = buildSupabaseMock();

    await sendGroupBookingNotifications(supabase as never, BOOKING_ID, GROUP_ID, {
      skipPrimaryContact: true,
    });

    const userIds = mockSendToUser.mock.calls.map((call) => call[0]);
    expect(userIds).not.toContain(PRIMARY_USER);
    expect(userIds).toContain(GUEST_USER);
  });

  it("notifies the primary when skipPrimaryContact is not set", async () => {
    const { sendGroupBookingNotifications } = await import("../group-booking-notifications");
    const supabase = buildSupabaseMock();

    await sendGroupBookingNotifications(supabase as never, BOOKING_ID, GROUP_ID);

    const userIds = mockSendToUser.mock.calls.map((call) => call[0]);
    expect(userIds).toContain(PRIMARY_USER);
    expect(userIds).toContain(GUEST_USER);
  });
});
