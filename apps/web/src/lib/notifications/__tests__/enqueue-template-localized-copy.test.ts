import { describe, expect, it } from "vitest";
import { buildTemplateChannelQueueRows } from "@/lib/notifications/enqueue-template-channels";

describe("buildTemplateChannelQueueRows localized copy", () => {
  it("uses per-recipient email subject and body when provided", () => {
    const rows = buildTemplateChannelQueueRows({
      templateKey: "booking_confirmed",
      recipients: [
        {
          userId: "user-a",
          channels: ["email"],
          emailSubject: "Confirmé",
          emailBody: "<p>FR body</p>",
        },
        {
          userId: "user-b",
          channels: ["email"],
          emailSubject: "Confirmed",
          emailBody: "<p>EN body</p>",
        },
      ],
      title: "Fallback",
      body: "Fallback",
      emailSubject: "Fallback subject",
      emailBody: "<p>Fallback</p>",
      smsBody: "Fallback sms",
      data: { template_key: "booking_confirmed" },
    });

    expect(rows).toHaveLength(2);
    const frRow = rows.find((r) => r.recipientUserId === "user-a");
    const enRow = rows.find((r) => r.recipientUserId === "user-b");
    expect(frRow?.payload).toMatchObject({ subject: "Confirmé", html: "<p>FR body</p>" });
    expect(enRow?.payload).toMatchObject({ subject: "Confirmed", html: "<p>EN body</p>" });
  });
});
