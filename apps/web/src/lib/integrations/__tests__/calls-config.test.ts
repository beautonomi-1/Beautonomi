import { describe, expect, it } from "vitest";
import {
  isSalestrailEnabled,
  isTwilioVoiceEnabled,
  salestrailWebhookCredentials,
} from "@/lib/integrations/calls-config";

describe("calls-config helpers", () => {
  it("isTwilioVoiceEnabled respects toggle", () => {
    expect(
      isTwilioVoiceEnabled({
        config: {
          id: "1",
          tenant_id: null,
          twilio_voice_enabled: true,
          salestrail_enabled: false,
          salestrail_webhook_username: null,
          salestrail_webhook_password: null,
          salestrail_default_tenant_id: null,
          updated_by: null,
          created_at: "",
          updated_at: "",
        },
        twilioVoiceConfigured: true,
      }),
    ).toBe(true);

    expect(
      isTwilioVoiceEnabled({
        config: {
          id: "1",
          tenant_id: null,
          twilio_voice_enabled: false,
          salestrail_enabled: false,
          salestrail_webhook_username: null,
          salestrail_webhook_password: null,
          salestrail_default_tenant_id: null,
          updated_by: null,
          created_at: "",
          updated_at: "",
        },
        twilioVoiceConfigured: true,
      }),
    ).toBe(false);
  });

  it("isSalestrailEnabled requires toggle and credentials", () => {
    expect(
      isSalestrailEnabled({
        config: {
          id: "1",
          tenant_id: null,
          twilio_voice_enabled: false,
          salestrail_enabled: true,
          salestrail_webhook_username: "user",
          salestrail_webhook_password: "pass",
          salestrail_default_tenant_id: null,
          updated_by: null,
          created_at: "",
          updated_at: "",
        },
        twilioVoiceConfigured: false,
      }),
    ).toBe(true);

    expect(
      isSalestrailEnabled({
        config: {
          id: "1",
          tenant_id: null,
          twilio_voice_enabled: false,
          salestrail_enabled: true,
          salestrail_webhook_username: "user",
          salestrail_webhook_password: null,
          salestrail_default_tenant_id: null,
          updated_by: null,
          created_at: "",
          updated_at: "",
        },
        twilioVoiceConfigured: false,
      }),
    ).toBe(false);
  });

  it("salestrailWebhookCredentials returns creds when configured", () => {
    expect(
      salestrailWebhookCredentials({
        id: "1",
        tenant_id: null,
        twilio_voice_enabled: false,
        salestrail_enabled: true,
        salestrail_webhook_username: "st-user",
        salestrail_webhook_password: "st-pass",
        salestrail_default_tenant_id: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
      }),
    ).toEqual({ username: "st-user", password: "st-pass" });
  });
});
