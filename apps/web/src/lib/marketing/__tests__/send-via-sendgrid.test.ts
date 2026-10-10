import { afterEach, describe, expect, it, vi } from "vitest";
import { sendViaSendGrid } from "../unified-service";

describe("sendViaSendGrid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success on HTTP 202 with X-Message-Id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 202,
        headers: {
          get: (name: string) => (name === "X-Message-Id" ? "sg-msg-id" : null),
        },
      }),
    );

    const result = await sendViaSendGrid(
      {
        id: "1",
        provider_id: "p1",
        provider_name: "sendgrid",
        api_key: "SG.test",
        from_email: "from@example.com",
        from_name: "Test",
        is_enabled: true,
        test_status: "success",
      },
      {
        to: "to@example.com",
        subject: "Subject",
        content: "<p>Body</p>",
      },
    );

    expect(result).toMatchObject({ success: true, messageId: "sg-msg-id", provider: "sendgrid" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/mail/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer SG.test" }),
      }),
    );
  });

  it("returns error when API key missing", async () => {
    const result = await sendViaSendGrid(
      {
        id: "1",
        provider_id: "p1",
        provider_name: "sendgrid",
        api_key: "",
        from_email: "from@example.com",
        from_name: "Test",
        is_enabled: true,
        test_status: "success",
      },
      { to: "to@example.com", subject: "S", content: "c" },
    );
    expect(result.success).toBe(false);
  });
});
