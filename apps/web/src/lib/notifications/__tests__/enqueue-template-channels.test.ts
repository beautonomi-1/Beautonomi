import { describe, expect, it } from "vitest";

import {
  buildTemplateChannelQueueRows,
  type TemplateChannelContext,
  type TemplateChannelRecipient,
} from "@/lib/notifications/enqueue-template-channels";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function baseCtx(
  recipients: TemplateChannelRecipient[],
  overrides: Partial<TemplateChannelContext> = {},
): TemplateChannelContext {
  return {
    templateKey: "booking_confirmed",
    recipients,
    bookingId: "book-1",
    tenantId: "tenant-1",
    title: "Booking confirmed",
    body: "Your booking is confirmed.",
    emailSubject: "Your booking is confirmed",
    emailBody: "<p>Your booking is confirmed.</p>",
    smsBody: "Booking confirmed for Jun 14 at 10:00.",
    data: { template_key: "booking_confirmed", booking_id: "book-1" },
    ...overrides,
  };
}

describe("buildTemplateChannelQueueRows", () => {
  it("creates one row per recipient × channel with provider-agnostic payloads", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([
        { userId: USER_A, channels: ["email", "sms"] },
        { userId: USER_B, channels: ["email", "sms"] },
      ]),
    );

    expect(rows).toHaveLength(4); // 2 users × (email + sms)

    const email = rows.find((r) => r.channel === "email" && r.recipientUserId === USER_A)!;
    expect(email).toBeDefined();
    expect(email.templateKey).toBe("booking_confirmed");
    expect(email.bookingId).toBe("book-1");
    expect(email.tenantId).toBe("tenant-1");
    // Matches the contract queued-senders reads: subject / html / text + body (plain text).
    expect(email.payload.subject).toBe("Your booking is confirmed");
    expect(String(email.payload.html)).toContain("max-width:640px");
    expect(String(email.payload.text)).not.toMatch(/<p>/);
    expect(String(email.payload.body)).toBe(String(email.payload.text));

    const sms = rows.find((r) => r.channel === "sms" && r.recipientUserId === USER_B)!;
    expect(sms).toBeDefined();
    expect(sms.payload).toMatchObject({ body: "Booking confirmed for Jun 14 at 10:00." });
  });

  it("honours per-recipient channels (per-user gating)", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([
        { userId: USER_A, channels: ["email", "sms"] },
        { userId: USER_B, channels: ["email"] }, // opted out of SMS
      ]),
    );

    const forA = rows.filter((r) => r.recipientUserId === USER_A).map((r) => r.channel).sort();
    const forB = rows.filter((r) => r.recipientUserId === USER_B).map((r) => r.channel).sort();
    expect(forA).toEqual(["email", "sms"]);
    expect(forB).toEqual(["email"]);
  });

  it("uses a stable, channel-scoped dedupe key", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([{ userId: USER_A, channels: ["email", "sms"] }]),
    );
    const email = rows.find((r) => r.channel === "email")!;
    const sms = rows.find((r) => r.channel === "sms")!;

    expect(email.dedupeKey).toBe(`template:booking_confirmed:${USER_A}:email:book-1`);
    expect(sms.dedupeKey).toBe(`template:booking_confirmed:${USER_A}:sms:book-1`);
  });

  it("honours a custom dedupe prefix and a missing booking id", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([{ userId: USER_A, channels: ["email"] }], {
        bookingId: null,
        dedupePrefix: "fallback",
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe(`fallback:booking_confirmed:${USER_A}:email:none`);
    expect(rows[0].bookingId).toBeNull();
  });

  it("ignores push / in-app channels (only email + sms route here)", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([{ userId: USER_A, channels: ["email", "sms", "push", "in_app"] as never }]),
    );
    expect(rows.map((r) => r.channel).sort()).toEqual(["email", "sms"]);
  });

  it("skips a channel when its content is empty", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([{ userId: USER_A, channels: ["email", "sms"] }], { smsBody: "", body: "" }),
    );
    // SMS has no body (and body fallback is empty) → only email row remains.
    expect(rows.map((r) => r.channel)).toEqual(["email"]);
  });

  it("falls back to title/body when email subject/body are empty", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([{ userId: USER_A, channels: ["email"] }], { emailSubject: "", emailBody: "" }),
    );
    expect(rows[0].payload.subject).toBe("Booking confirmed");
    expect(String(rows[0].payload.html)).toContain("max-width:640px");
    expect(String(rows[0].payload.text)).toContain("Your booking is confirmed.");
  });

  it("passes through full-document email_body without double wrap", () => {
    const fullDoc = `<!doctype html><html><body><table role="presentation" style="max-width:640px"><tr><td>Receipt</td></tr></table></body></html>`;
    const rows = buildTemplateChannelQueueRows(
      baseCtx([{ userId: USER_A, channels: ["email"] }], { emailBody: fullDoc }),
    );
    expect(String(rows[0].payload.html)).toBe(fullDoc);
  });

  it("adds CTA when emailCtaWebUrl is set", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([{ userId: USER_A, channels: ["email"] }], {
        emailCtaWebUrl: "https://app.example.com/bookings/1",
      }),
    );
    expect(String(rows[0].payload.html)).toContain("https://app.example.com/bookings/1");
  });

  it("returns no rows when there are no recipients/channels", () => {
    expect(buildTemplateChannelQueueRows(baseCtx([]))).toEqual([]);
    expect(
      buildTemplateChannelQueueRows(baseCtx([{ userId: USER_A, channels: [] }])),
    ).toEqual([]);
  });

  it("skips falsy recipient ids", () => {
    const rows = buildTemplateChannelQueueRows(
      baseCtx([
        { userId: USER_A, channels: ["sms"] },
        { userId: "", channels: ["sms"] },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(USER_A);
  });
});
