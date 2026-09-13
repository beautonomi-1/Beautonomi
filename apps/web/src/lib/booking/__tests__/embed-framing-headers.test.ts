import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const nextConfig = readFileSync(join(__dirname, "../../../../next.config.mjs"), "utf8");
const embedScript = readFileSync(
  join(__dirname, "../../../../public/embed/booking-button.js"),
  "utf8",
);

describe("booking iframe framing policy", () => {
  it("does not send global X-Frame-Options SAMEORIGIN (Safari honours XFO over CSP)", () => {
    expect(nextConfig).not.toMatch(/X-Frame-Options['"]?\s*,\s*value:\s*'SAMEORIGIN'/);
    expect(nextConfig).not.toMatch(/key:\s*'X-Frame-Options'/);
  });

  it("locks non-embed pages with frame-ancestors 'self' and allows * on public booking surfaces", () => {
    expect(nextConfig).toContain("contentSecurityPolicy(\"'self'\")");
    expect(nextConfig).toContain("source: '/book/:path*'");
    expect(nextConfig).toContain("source: '/checkout/success'");
    expect(nextConfig).toContain("source: '/auth/callback'");
    expect(nextConfig).toContain("contentSecurityPolicy('*')");
    const catchAll = nextConfig.indexOf("source: '/:path*'");
    const bookEmbed = nextConfig.indexOf("source: '/book/:path*'");
    expect(catchAll).toBeGreaterThan(-1);
    expect(bookEmbed).toBeGreaterThan(catchAll);
  });

  it("keeps embed=1 when joining waitlist from the express schedule step", () => {
    const stepSchedule = readFileSync(
      join(__dirname, "../../../app/book/components/booking-engine/StepSchedule.tsx"),
      "utf8",
    );
    expect(stepSchedule).toContain("appendBookingEmbedQuery");
    expect(stepSchedule).toContain("/checkout/success?waitlist=1");
  });

  it("ships an iframe-mode host script that origin-checks postMessage", () => {
    expect(embedScript).toContain('data-mode');
    expect(embedScript).toContain("beautonomi-booking-embed");
    expect(embedScript).toContain("event.origin !== allowedOrigin");
    expect(embedScript).toContain("payment *; clipboard-write");
  });

  it("finds the embed script without document.currentScript (GTM / delayed WP)", () => {
    expect(embedScript).toContain("document.currentScript");
    expect(embedScript).toContain('script[src*="booking-button.js"][data-provider]');
    expect(embedScript).toContain("data-beautonomi-mounted");
    expect(embedScript).toContain("/^https?:\\/\\//i.test");
  });

  it("hides cookie chrome and download banner on the embed surface", () => {
    const cookie = readFileSync(
      join(__dirname, "../../../components/cookie-consent/CookieConsentExperience.tsx"),
      "utf8",
    );
    const banner = readFileSync(
      join(__dirname, "../../../components/download-banner/DownloadBannerContainer.tsx"),
      "utf8",
    );
    expect(cookie).toContain("isBookingEmbedSurface");
    expect(cookie).toContain("embedChecked");
    expect(banner).toContain("isBookingEmbedSurface");
  });

  it("lets Paystack cancel land without a session", () => {
    const proxy = readFileSync(join(__dirname, "../../../../src/proxy.ts"), "utf8");
    expect(proxy).toContain("pathname === '/checkout/cancelled'");
  });

  it("keeps embed=1 on continue login next when the hold id is missing", () => {
    const continuePage = readFileSync(
      join(__dirname, "../../../app/book/continue/page.tsx"),
      "utf8",
    );
    expect(continuePage).toContain('appendBookingEmbedQuery("/book/continue", embed)');
  });

  it("breaks the success app deep link out of the iframe and hides custom-link download chrome", () => {
    const success = readFileSync(
      join(__dirname, "../../../app/checkout/success/page.tsx"),
      "utf8",
    );
    expect(success).toContain("href={openInAppUrl}");
    expect(success).toContain('target={embed ? "_top" : undefined}');
    const customLink = readFileSync(
      join(__dirname, "../../../app/book/l/[linkSlug]/page.tsx"),
      "utf8",
    );
    expect(customLink).toContain("showBanner && !embed");
  });
});
