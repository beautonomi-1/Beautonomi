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
    expect(frRow?.payload.subject).toBe("Confirmé");
    expect(String(frRow?.payload.html)).toContain("Confirmé");
    expect(String(frRow?.payload.html)).toContain("FR body");
    expect(String(frRow?.payload.text)).toContain("FR body");

    expect(enRow?.payload.subject).toBe("Confirmed");
    expect(String(enRow?.payload.html)).toContain("EN body");
    expect(String(enRow?.payload.html)).not.toContain("FR body");
  });
});
