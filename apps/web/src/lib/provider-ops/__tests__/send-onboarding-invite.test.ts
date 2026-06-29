import { describe, expect, it, vi, beforeEach } from "vitest";

const sendResendEmail = vi.fn();
const resolveResendCredentials = vi.fn();
const sendTwilioSMS = vi.fn();
const resolveTwilioCredentials = vi.fn();

vi.mock("@/lib/integrations/resend", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
  resolveResendCredentials: (...args: unknown[]) => resolveResendCredentials(...args),
}));

vi.mock("@/lib/integrations/twilio", () => ({
  sendTwilioSMS: (...args: unknown[]) => sendTwilioSMS(...args),
  resolveTwilioCredentials: (...args: unknown[]) => resolveTwilioCredentials(...args),
}));

vi.mock("../resolve-provider-app-links", () => ({
  resolveProviderAppLinks: vi.fn().mockResolvedValue({
    ios: "https://apps.apple.com/app/beautonomi-provider",
    android: "https://play.google.com/store/apps/details?id=com.beautonomi.partner",
    huawei: null,
  }),
}));

import { sendOnboardingInvite } from "../send-onboarding-invite";

interface CapturedInsert {
  table: string;
  row: Record<string, unknown>;
}

function makeSupabase() {
  const inserts: CapturedInsert[] = [];
  const supabase = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { supabase, inserts };
}

const baseLead = {
  id: "lead-1",
  email: "owner@salon.com",
  phone_e164: "+27820000000",
  contact_person_name: "Thandi Mokoena",
  business_name: "Glow Salon",
};

const inviteLink = "https://beautonomi.com/provider/onboarding?invite=tok-123";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendOnboardingInvite", () => {
  it("delivers an email with onboarding + app links and logs email_sent", async () => {
    resolveResendCredentials.mockResolvedValue({
      apiKey: "re_test",
      fromAddress: "Beautonomi <notifications@beautonomi.app>",
    });
    sendResendEmail.mockResolvedValue(undefined);

    const { supabase, inserts } = makeSupabase();

    const result = await sendOnboardingInvite({
      supabase: supabase as never,
      tenantId: "tenant-1",
      lead: baseLead,
      inviteLink,
      channel: "email",
      performedBy: "admin-1",
    });

    expect(result.delivered).toBe(true);
    expect(result.delivery_error).toBeNull();
    expect(result.sent_to).toBe("owner@salon.com");

    // Email body includes onboarding link and the resolved store links.
    const emailArgs = sendResendEmail.mock.calls[0][0] as { to: string; html: string; text: string };
    expect(emailArgs.to).toBe("owner@salon.com");
    expect(emailArgs.text).toContain(inviteLink);
    expect(emailArgs.html).toContain("play.google.com/store/apps/details?id=com.beautonomi.partner");
    expect(emailArgs.text).toContain("Thandi"); // personalised first name

    const comm = inserts.find((i) => i.table === "provider_lead_communications");
    expect(comm?.row.channel).toBe("email");
    expect(comm?.row.status).toBe("sent");

    const activity = inserts.find((i) => i.table === "provider_lead_activities");
    expect(activity?.row.activity_type).toBe("email_sent");
  });

  it("degrades gracefully when the email provider is not configured", async () => {
    resolveResendCredentials.mockResolvedValue(null);

    const { supabase, inserts } = makeSupabase();

    const result = await sendOnboardingInvite({
      supabase: supabase as never,
      tenantId: "tenant-1",
      lead: baseLead,
      inviteLink,
      channel: "email",
      performedBy: "admin-1",
    });

    expect(result.delivered).toBe(false);
    expect(result.delivery_error).toMatch(/not configured/i);
    expect(sendResendEmail).not.toHaveBeenCalled();

    const comm = inserts.find((i) => i.table === "provider_lead_communications");
    expect(comm?.row.status).toBe("failed");
    // The link is still persisted so the admin can copy/send it manually.
    expect((comm?.row.metadata as { invite_link?: string }).invite_link).toBe(inviteLink);

    const activity = inserts.find((i) => i.table === "provider_lead_activities");
    expect(activity?.row.activity_type).toBe("note");
  });

  it("delivers an SMS containing the invite link and records the message id", async () => {
    resolveTwilioCredentials.mockResolvedValue({
      accountSid: "AC",
      authToken: "tok",
      smsFrom: "+27110000000",
      whatsappFrom: "",
      messagingServiceSid: "",
      whatsappSandboxEnabled: false,
    });
    sendTwilioSMS.mockResolvedValue({ sid: "SM123", status: "queued" });

    const { supabase, inserts } = makeSupabase();

    const result = await sendOnboardingInvite({
      supabase: supabase as never,
      tenantId: "tenant-1",
      lead: baseLead,
      inviteLink,
      channel: "sms",
      performedBy: "admin-1",
    });

    expect(result.delivered).toBe(true);
    expect(result.sent_to).toBe("+27820000000");
    expect(result.external_message_id).toBe("SM123");

    const smsBody = sendTwilioSMS.mock.calls[0][2] as string;
    expect(smsBody).toContain(inviteLink);

    const activity = inserts.find((i) => i.table === "provider_lead_activities");
    expect(activity?.row.activity_type).toBe("sms_sent");
  });

  it("records a delivery error (without throwing) when the provider send fails", async () => {
    resolveTwilioCredentials.mockResolvedValue({
      accountSid: "AC",
      authToken: "tok",
      smsFrom: "+27110000000",
      whatsappFrom: "",
      messagingServiceSid: "",
      whatsappSandboxEnabled: false,
    });
    sendTwilioSMS.mockRejectedValue(new Error("Twilio rejected: invalid number"));

    const { supabase, inserts } = makeSupabase();

    const result = await sendOnboardingInvite({
      supabase: supabase as never,
      tenantId: "tenant-1",
      lead: baseLead,
      inviteLink,
      channel: "sms",
      performedBy: "admin-1",
    });

    expect(result.delivered).toBe(false);
    expect(result.delivery_error).toContain("invalid number");

    const comm = inserts.find((i) => i.table === "provider_lead_communications");
    expect(comm?.row.status).toBe("failed");
  });
});
