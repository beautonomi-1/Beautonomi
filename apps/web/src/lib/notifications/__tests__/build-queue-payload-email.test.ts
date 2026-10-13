import { describe, expect, it } from "vitest";

/**
 * buildQueuePayload is module-private in onesignal.ts; mirror its email branch contract here
 * so must-deliver retry stays aligned with buildTemplateChannelPayload.
 */
import { finalizeTemplateEmailHtml } from "@/lib/email/finalize-notification-email";

describe("must-deliver email payload contract", () => {
  it("matches enqueue-template email finalize (html + plain text + CTA)", () => {
    const subject = "Payment successful";
    const rawHtml = "<p>Thanks for your payment.</p>";
    const { html, text } = finalizeTemplateEmailHtml({
      emailSubject: subject,
      emailBody: rawHtml,
      ctaHref: "https://app.beautonomi.com/bookings/abc",
    });
    expect(html).toContain("max-width:640px");
    expect(html).toContain("https://app.beautonomi.com/bookings/abc");
    expect(text).not.toMatch(/<p>/);
    expect(text.length).toBeGreaterThan(5);
  });
});
