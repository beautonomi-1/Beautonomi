import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMailchimpMarketingApiKey,
  mapMandrillApiError,
  pingMailchimpTransactional,
  sendViaMailchimpTransactional,
  validateEmailApiKeyForProvider,
} from "../send-via-mailchimp";

const integration = {
  api_key: "mandrill-test-key",
  from_email: "hello@verified.example",
  from_name: "Salon",
};

describe("send-via-mailchimp (Mandrill)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects Mailchimp Marketing API key shape", () => {
    expect(isMailchimpMarketingApiKey("a1b2c3d4e5f6789012345678abcdef01-xx1")).toBe(true);
    expect(isMailchimpMarketingApiKey("mandrill-plain-key")).toBe(false);
  });

  it("validateEmailApiKeyForProvider rejects cross-provider keys", () => {
    expect(validateEmailApiKeyForProvider("sendgrid", "SG.test")).toBeNull();
    expect(validateEmailApiKeyForProvider("sendgrid", "mandrill-key")).toContain("SendGrid");
    expect(validateEmailApiKeyForProvider("mailchimp", "SG.test")).toContain("SendGrid");
    expect(validateEmailApiKeyForProvider("mailchimp", "mandrill-key")).toBeNull();
  });

  it("maps Invalid_Key from ping", () => {
    expect(mapMandrillApiError({ name: "Invalid_Key", message: "Invalid API key" }, "x")).toContain(
      "Invalid Mailchimp Transactional",
    );
  });

  it("ping returns ok on PONG!", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify("PONG!"),
      }),
    );
    const result = await pingMailchimpTransactional("key");
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://mandrillapp.com/api/1.4/users/ping",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("ping fails on Invalid_Key HTTP 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ name: "Invalid_Key", message: "Invalid API key" }),
      }),
    );
    const result = await pingMailchimpTransactional("bad");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid Mailchimp Transactional");
    }
  });

  it("send rejects marketing key before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendViaMailchimpTransactional(
      { ...integration, api_key: "a1b2c3d4e5f6789012345678abcdef01-xx1" },
      { to: "a@b.com", subject: "Hi", content: "<p>x</p>" },
    );
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("send maps unsigned reject_reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            { email: "a@b.com", status: "rejected", _id: "1", reject_reason: "unsigned" },
          ]),
      }),
    );
    const result = await sendViaMailchimpTransactional(integration, {
      to: "a@b.com",
      subject: "Hi",
      content: "<p>x</p>",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not verified");
  });

  it("send succeeds for sent status with message id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            { email: "a@b.com", status: "sent", _id: "msg-123" },
            { email: "b@b.com", status: "queued", _id: "msg-456" },
          ]),
      }),
    );
    const result = await sendViaMailchimpTransactional(integration, {
      to: ["a@b.com", "b@b.com"],
      subject: "Hi",
      content: "<p>x</p>",
    });
    expect(result).toMatchObject({ success: true, messageId: "msg-123", provider: "mailchimp" });
  });
});
