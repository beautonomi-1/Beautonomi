import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendResendEmail = vi.fn();
const mockResolveTwilioCredentials = vi.fn();
const mockSendTwilioSMS = vi.fn();

vi.mock("@/lib/integrations/resend", () => ({
  sendResendEmail: (...args: unknown[]) => mockSendResendEmail(...args),
}));

vi.mock("@/lib/integrations/twilio", () => ({
  resolveTwilioCredentials: (...args: unknown[]) => mockResolveTwilioCredentials(...args),
  sendTwilioSMS: (...args: unknown[]) => mockSendTwilioSMS(...args),
}));

function buildSupabase(existingUserEmails: string[]) {
  const providerLookups = vi.fn();
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: (_col: string, email: string) => ({
              maybeSingle: async () => ({
                data: existingUserEmails.includes(email) ? { id: `user-${email}` } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "providers") {
        providerLookups();
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { tenant_id: "tenant-1" }, error: null }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { client, providerLookups };
}

describe("notifyGroupGuestsWithoutAccountsOfCancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendResendEmail.mockResolvedValue(undefined);
    mockResolveTwilioCredentials.mockResolvedValue({ smsFrom: "+27100000000" });
    mockSendTwilioSMS.mockResolvedValue(undefined);
  });

  it("emails and texts guests without an account, including phone-only guests", async () => {
    const { notifyGroupGuestsWithoutAccountsOfCancellation } = await import("../group-booking-notifications");
    const { client } = buildSupabase(["member@example.com"]);

    const result = await notifyGroupGuestsWithoutAccountsOfCancellation(client as never, {
      participants: [
        { participant_name: "Member", participant_email: "member@example.com", participant_phone: "+27111111111" },
        { participant_name: "Ann", participant_email: "ann@example.com", participant_phone: "+27822222222" },
        { participant_name: "Ben", participant_email: null, participant_phone: "+27833333333" },
        { participant_name: "Nobody", participant_email: null, participant_phone: null },
      ],
      providerId: "provider-1",
      bookingRef: "GB-1",
      cancelledBy: "provider",
    });

    expect(result.notified).toBe(2);
    expect(mockSendResendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendResendEmail.mock.calls[0]![0]).toMatchObject({ to: "ann@example.com" });
    expect(mockSendTwilioSMS).toHaveBeenCalledTimes(2);
    expect(mockSendTwilioSMS.mock.calls.map((c) => c[1])).toEqual(["+27822222222", "+27833333333"]);
    expect(String(mockSendTwilioSMS.mock.calls[0]![2])).toContain("the provider has cancelled group booking GB-1");
    expect(String(mockSendTwilioSMS.mock.calls[0]![2])).toContain("refunded in full to the card you paid with");
    expect(mockResolveTwilioCredentials).toHaveBeenCalledTimes(1);
  });

  it("skips SMS when the tenant has no sender number and never looks up the provider without phones", async () => {
    mockResolveTwilioCredentials.mockResolvedValue({ smsFrom: null });
    const { notifyGroupGuestsWithoutAccountsOfCancellation } = await import("../group-booking-notifications");

    const withPhone = buildSupabase([]);
    await notifyGroupGuestsWithoutAccountsOfCancellation(withPhone.client as never, {
      participants: [{ participant_name: "Ann", participant_email: null, participant_phone: "+27822222222" }],
      providerId: "provider-1",
      bookingRef: "GB-2",
      cancelledBy: "customer",
    });
    expect(mockSendTwilioSMS).not.toHaveBeenCalled();

    const emailOnly = buildSupabase([]);
    await notifyGroupGuestsWithoutAccountsOfCancellation(emailOnly.client as never, {
      participants: [{ participant_name: "Ann", participant_email: "ann@example.com", participant_phone: null }],
      providerId: "provider-1",
      bookingRef: "GB-3",
      cancelledBy: "customer",
    });
    expect(emailOnly.providerLookups).not.toHaveBeenCalled();
    expect(mockSendResendEmail).toHaveBeenCalledTimes(1);
  });
});
