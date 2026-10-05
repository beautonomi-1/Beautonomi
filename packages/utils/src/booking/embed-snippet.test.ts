import { describe, expect, it } from "vitest";
import {
  BOOKING_EMBED_MESSAGE_SOURCE,
  appendBookingEmbedQuery,
  buildBookContinuePath,
  buildBookingButtonScriptSnippet,
  buildBookingEmbedUrl,
  buildBookingIframeSnippet,
  buildExpressBookingEmbedUrl,
  buildExpressBookingIframeSnippet,
  clampBookingEmbedHeight,
  createBookingEmbedMessage,
  isBookingEmbedEnabled,
  isBookingEmbedMessage,
  normalizePublicOrigin,
} from "./embed-snippet";

describe("embed-snippet", () => {
  it("builds a third-party iframe URL with embed=1", () => {
    expect(buildBookingEmbedUrl("https://app.beautonomi.com/", "luxe-salon")).toBe(
      "https://app.beautonomi.com/booking?slug=luxe-salon&embed=1",
    );
  });

  it("escapes attributes in the iframe snippet and includes framing attrs", () => {
    const html = buildBookingIframeSnippet({
      origin: "https://app.beautonomi.com",
      slug: 'salon"><script>',
      height: 800,
    });
    expect(html).toContain('src="https://app.beautonomi.com/booking?slug=salon%22%3E%3Cscript%3E&amp;embed=1"');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('allow="payment *; clipboard-write"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("<script>");
  });

  it("builds iframe-mode script that targets a host node", () => {
    const snippet = buildBookingButtonScriptSnippet({
      origin: "https://app.beautonomi.com",
      slug: "luxe-salon",
      mode: "iframe",
    });
    expect(snippet).toContain('data-mode="iframe"');
    expect(snippet).toContain('data-target="#beautonomi-booking-widget"');
    expect(snippet).toContain("/embed/booking-button.js");
  });

  it("preserves embed=1 on continue and success paths", () => {
    expect(buildBookContinuePath("hold-1", true)).toBe("/booking?hold_id=hold-1&step=pay&embed=1");
    expect(buildBookContinuePath("hold-1", false)).toBe("/booking?hold_id=hold-1&step=pay");
    expect(appendBookingEmbedQuery("/checkout/success?booking_id=abc", true)).toBe(
      "/checkout/success?booking_id=abc&embed=1",
    );
    expect(
      appendBookingEmbedQuery("/booking/on-demand/waiting?requestId=req-1", true),
    ).toBe("/booking/on-demand/waiting?requestId=req-1&embed=1");
    expect(appendBookingEmbedQuery("/checkout/success?waitlist=1", true)).toBe(
      "/checkout/success?waitlist=1&embed=1",
    );
  });

  it("recognises embed search params and postMessage payloads", () => {
    expect(isBookingEmbedEnabled({ get: (k) => (k === "embed" ? "1" : null) })).toBe(true);
    expect(isBookingEmbedEnabled({ get: () => null })).toBe(false);
    const msg = createBookingEmbedMessage("resize", { height: 920 });
    expect(isBookingEmbedMessage(msg)).toBe(true);
    expect(isBookingEmbedMessage({ source: "other", type: "resize" })).toBe(false);
    expect(msg.source).toBe(BOOKING_EMBED_MESSAGE_SOURCE);
  });

  it("builds express link iframe URLs with embed=1", () => {
    expect(buildExpressBookingEmbedUrl("https://app.beautonomi.com", "abc123")).toBe(
      "https://app.beautonomi.com/book/l/abc123?embed=1",
    );
    const html = buildExpressBookingIframeSnippet({
      origin: "https://app.beautonomi.com",
      linkCode: "abc123",
    });
    expect(html).toContain("/book/l/abc123?embed=1");
  });

  it("clamps iframe height and strips trailing slashes on origin", () => {
    expect(clampBookingEmbedHeight(12)).toBe(400);
    expect(clampBookingEmbedHeight(9999)).toBe(2400);
    expect(normalizePublicOrigin("https://app.beautonomi.com///")).toBe("https://app.beautonomi.com");
  });
});
