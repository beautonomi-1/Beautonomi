import { describe, expect, it } from "vitest";
import {
  BOOKING_EMBED_MESSAGE_SOURCE,
  appendBookingEmbedQuery,
  buildBookContinuePath,
  buildBookingButtonScriptSnippet,
  buildBookingEmbedUrl,
  buildBookingIframeSnippet,
  clampBookingEmbedHeight,
  createBookingEmbedMessage,
  isBookingEmbedEnabled,
  isBookingEmbedMessage,
  normalizePublicOrigin,
} from "./embed-snippet";

describe("embed-snippet", () => {
  it("builds a third-party iframe URL with embed=1", () => {
    expect(buildBookingEmbedUrl("https://app.beautonomi.com/", "luxe-salon")).toBe(
      "https://app.beautonomi.com/book/luxe-salon?embed=1",
    );
  });

  it("escapes attributes in the iframe snippet and includes framing attrs", () => {
    const html = buildBookingIframeSnippet({
      origin: "https://app.beautonomi.com",
      slug: 'salon"><script>',
      height: 800,
    });
    expect(html).toContain('src="https://app.beautonomi.com/book/salon%22%3E%3Cscript%3E?embed=1"');
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
    expect(buildBookContinuePath("hold-1", true)).toBe("/book/continue?hold_id=hold-1&embed=1");
    expect(buildBookContinuePath("hold-1", false)).toBe("/book/continue?hold_id=hold-1");
    expect(appendBookingEmbedQuery("/checkout/success?booking_id=abc", true)).toBe(
      "/checkout/success?booking_id=abc&embed=1",
    );
    expect(
      appendBookingEmbedQuery("/book/on-demand/waiting?requestId=req-1", true),
    ).toBe("/book/on-demand/waiting?requestId=req-1&embed=1");
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

  it("clamps iframe height and strips trailing slashes on origin", () => {
    expect(clampBookingEmbedHeight(12)).toBe(400);
    expect(clampBookingEmbedHeight(9999)).toBe(2400);
    expect(normalizePublicOrigin("https://app.beautonomi.com///")).toBe("https://app.beautonomi.com");
  });
});
