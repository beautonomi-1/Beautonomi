import { randomBytes } from "crypto";

/** Request header set by `proxy.ts` and read in the root layout. */
export const CSP_NONCE_HEADER = "x-nonce";

export function generateCspNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * Report-only CSP that mirrors the enforced policy in `next.config.mjs`, but
 * replaces `unsafe-inline` script allowances with a per-request nonce.
 * Violations are reported without blocking while we validate compatibility.
 */
export function buildReportOnlyCsp(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://*.sentry.io",
    "https://cdn.onesignal.com",
    "https://cdn.amplitude.com",
    "https://maps.googleapis.com",
    "https://api.mapbox.com",
    "https://va.vercel-scripts.com",
    "https://vercel.live",
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com https://vercel.live https://*.vercel.live",
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://maps.googleapis.com https://maps.gstatic.com https://api.mapbox.com https://events.mapbox.com https://flagcdn.com https://vercel.com https://*.vercel.com https://vercel.live https://*.vercel.live",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.onesignal.com https://*.sentry.io https://*.amplitude.com https://api.paystack.co https://api.mapbox.com https://events.mapbox.com https://vercel.live https://*.vercel.live wss://*.pusher.com wss://ws-us3.pusher.com wss://ws-us2.pusher.com wss://ws-eu.pusher.com",
    "frame-src 'self' https://checkout.paystack.com https://js.paystack.co https://verify.didit.me https://*.didit.me https://vercel.live",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
