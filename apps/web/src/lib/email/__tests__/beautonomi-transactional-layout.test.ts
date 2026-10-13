import { describe, expect, it } from "vitest";
import { buildTemplateChannelPayload } from "@/lib/notifications/enqueue-template-channels";
import {
  finalizeTemplateEmailHtml,
  htmlToPlainText,
  isFullDocumentEmailHtml,
  maybeWrapNotificationEmailHtml,
  renderBeautonomiTransactionalEmail,
} from "@/lib/email/beautonomi-transactional-layout";

const FULL_542_SNIPPET = `<!doctype html>
<html><body>
<table role="presentation" width="100%"><tr><td>
<table role="presentation" style="max-width:640px;background:#ffffff;">
<tr><td style="background:#111827;"><h1>Receipt</h1></td></tr>
</table></td></tr></table></body></html>`;

describe("isFullDocumentEmailHtml", () => {
  it("passes through doctype documents", () => {
    expect(isFullDocumentEmailHtml(FULL_542_SNIPPET)).toBe(true);
  });

  it("passes through presentation + 640px shell without doctype", () => {
    const html =
      '<table role="presentation" style="max-width:640px"><tr><td>Hi</td></tr></table>';
    expect(isFullDocumentEmailHtml(html)).toBe(true);
  });

  it("wraps legacy fragments", () => {
    expect(isFullDocumentEmailHtml("<p>Hello</p>")).toBe(false);
  });
});

describe("maybeWrapNotificationEmailHtml", () => {
  it("wraps fragments with hero and 542 shell signature", () => {
    const html = maybeWrapNotificationEmailHtml("<p>Your booking is confirmed</p>", {
      heroTitle: "Booking confirmed",
      ctaHref: "https://app.beautonomi.com/bookings/abc",
    });
    expect(html.toLowerCase()).toContain("<!doctype");
    expect(html).toContain('role="presentation"');
    expect(html).toContain("max-width:640px");
    expect(html).toContain("Booking confirmed");
    expect(html).toContain("Your booking is confirmed");
    expect(html).toContain("https://app.beautonomi.com/bookings/abc");
  });

  it("does not double-wrap full documents", () => {
    const wrapped = maybeWrapNotificationEmailHtml(FULL_542_SNIPPET, {
      heroTitle: "Ignored",
    });
    expect(wrapped).toBe(FULL_542_SNIPPET);
    expect(wrapped.match(/max-width:640px/g)?.length).toBe(1);
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and preserves link URLs", () => {
    const text = htmlToPlainText(
      '<p>Hello <a href="https://example.com/path">View booking</a></p>',
    );
    expect(text).not.toMatch(/<p>/);
    expect(text).toContain("View booking: https://example.com/path");
    expect(text).toContain("Hello");
  });
});

describe("finalizeTemplateEmailHtml", () => {
  it("returns non-empty plain text for wrapped HTML", () => {
    const { html, text } = finalizeTemplateEmailHtml({
      emailSubject: "Payment received",
      emailBody: "<p>Thanks for your payment.</p>",
      ctaHref: "/bookings/1",
    });
    expect(html).toContain("max-width:640px");
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/<[^>]+>/);
  });
});

describe("renderBeautonomiTransactionalEmail", () => {
  it("includes stable brand tokens", () => {
    const html = renderBeautonomiTransactionalEmail({
      heroTitle: "Test hero",
      detailRows: [{ label: "Amount", value: "$10" }],
      cta: { label: "Open", href: "https://app.beautonomi.com" },
    });
    expect(html).toContain("#FF0077");
    expect(html).toContain("Test hero");
    expect(html).toContain("max-width:640px");
    expect(html).toContain("automatically generated Beautonomi");
  });
});

describe("buildTemplateChannelPayload email", () => {
  it("finalizes HTML with 542 signature and separate plain text", () => {
    const payload = buildTemplateChannelPayload("email", {
      templateKey: "booking_confirmed",
      recipients: [],
      title: "Booking confirmed",
      body: "Your booking is confirmed",
      emailSubject: "Booking confirmed",
      emailBody: "<p>Your booking is confirmed</p>",
      smsBody: "Booking confirmed",
      data: { template_key: "booking_confirmed" },
      emailCtaWebUrl: "https://app.beautonomi.com/bookings/x",
    });
    expect(payload).not.toBeNull();
    const html = String(payload!.html);
    const text = String(payload!.text);
    expect(html).toContain("max-width:640px");
    expect(text).not.toMatch(/<p>/);
    expect(payload).toMatchObject({ subject: "Booking confirmed" });
  });
});
