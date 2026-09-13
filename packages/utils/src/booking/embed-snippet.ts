/**
 * Public booking widget snippets and postMessage contract.
 * Shared by provider web settings, the partner app, and embed tests.
 */

export const BOOKING_EMBED_MESSAGE_SOURCE = "beautonomi-booking-embed";
export const BOOKING_EMBED_QUERY_KEY = "embed";
export const BOOKING_EMBED_QUERY_VALUE = "1";
export const BOOKING_EMBED_DEFAULT_HEIGHT = 800;
export const BOOKING_EMBED_MIN_HEIGHT = 400;
export const BOOKING_EMBED_MAX_HEIGHT = 2400;

export type BookingEmbedMessageType =
  | "ready"
  | "resize"
  | "booked"
  | "payment_redirect"
  | "auth_required";

export type BookingEmbedMessage = {
  source: typeof BOOKING_EMBED_MESSAGE_SOURCE;
  type: BookingEmbedMessageType;
  height?: number;
  url?: string;
  bookingId?: string;
  bookingNumber?: string | null;
};

export type BookingEmbedSnippetInput = {
  origin: string;
  slug: string;
  height?: number;
  utmSource?: string;
};

export function isBookingEmbedQueryParam(value: string | null | undefined): boolean {
  return value === BOOKING_EMBED_QUERY_VALUE;
}

export function isBookingEmbedEnabled(
  search: { get: (key: string) => string | null } | null | undefined,
): boolean {
  return isBookingEmbedQueryParam(search?.get(BOOKING_EMBED_QUERY_KEY) ?? null);
}

export function normalizePublicOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export function clampBookingEmbedHeight(height: number | undefined): number {
  const n = typeof height === "number" && Number.isFinite(height) ? Math.round(height) : BOOKING_EMBED_DEFAULT_HEIGHT;
  return Math.min(BOOKING_EMBED_MAX_HEIGHT, Math.max(BOOKING_EMBED_MIN_HEIGHT, n));
}

export function buildBookingEmbedUrl(origin: string, slug: string, extra?: Record<string, string>): string {
  const base = `${normalizePublicOrigin(origin)}/book/${encodeURIComponent(slug)}`;
  const params = new URLSearchParams({ [BOOKING_EMBED_QUERY_KEY]: BOOKING_EMBED_QUERY_VALUE });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `${base}?${params.toString()}`;
}

export function buildBookContinuePath(holdId: string, embed: boolean): string {
  const params = new URLSearchParams({ hold_id: holdId });
  if (embed) params.set(BOOKING_EMBED_QUERY_KEY, BOOKING_EMBED_QUERY_VALUE);
  return `/book/continue?${params.toString()}`;
}

export function appendBookingEmbedQuery(pathWithQuery: string, embed: boolean): string {
  if (!embed) return pathWithQuery;
  const qIndex = pathWithQuery.indexOf("?");
  const path = qIndex >= 0 ? pathWithQuery.slice(0, qIndex) : pathWithQuery;
  const query = qIndex >= 0 ? pathWithQuery.slice(qIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.set(BOOKING_EMBED_QUERY_KEY, BOOKING_EMBED_QUERY_VALUE);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildBookingIframeSnippet(input: BookingEmbedSnippetInput): string {
  const origin = normalizePublicOrigin(input.origin);
  const embedUrl = buildBookingEmbedUrl(origin, input.slug);
  const height = clampBookingEmbedHeight(input.height);
  return [
    `<iframe`,
    `  src="${escapeHtmlAttr(embedUrl)}"`,
    `  title="Book an appointment"`,
    `  width="100%"`,
    `  height="${height}"`,
    `  loading="lazy"`,
    `  referrerpolicy="strict-origin-when-cross-origin"`,
    `  allow="payment *; clipboard-write"`,
    `  style="width:100%;min-height:${height}px;border:0;border-radius:12px;"`,
    `></iframe>`,
  ].join("\n");
}

export function buildBookingButtonScriptSnippet(input: BookingEmbedSnippetInput & { mode?: "iframe" | "button" }): string {
  const origin = normalizePublicOrigin(input.origin);
  const scriptUrl = `${origin}/embed/booking-button.js`;
  const mode = input.mode ?? "button";
  const height = clampBookingEmbedHeight(input.height);
  const utm = input.utmSource?.trim() || "website";
  if (mode === "iframe") {
    return [
      `<div id="beautonomi-booking-widget"></div>`,
      `<script src="${escapeHtmlAttr(scriptUrl)}"`,
      `  data-provider="${escapeHtmlAttr(input.slug)}"`,
      `  data-mode="iframe"`,
      `  data-target="#beautonomi-booking-widget"`,
      `  data-height="${height}"`,
      `  data-utm-source="${escapeHtmlAttr(utm)}"></script>`,
    ].join("\n");
  }
  return [
    `<script src="${escapeHtmlAttr(scriptUrl)}"`,
    `  data-provider="${escapeHtmlAttr(input.slug)}"`,
    `  data-mode="button"`,
    `  data-utm-source="${escapeHtmlAttr(utm)}"></script>`,
    `<button type="button" id="beautonomi-book-now">Book Now</button>`,
  ].join("\n");
}

export function isBookingEmbedMessage(data: unknown): data is BookingEmbedMessage {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  if (row.source !== BOOKING_EMBED_MESSAGE_SOURCE) return false;
  const type = row.type;
  return (
    type === "ready" ||
    type === "resize" ||
    type === "booked" ||
    type === "payment_redirect" ||
    type === "auth_required"
  );
}

export function createBookingEmbedMessage(
  type: BookingEmbedMessageType,
  extra?: Omit<BookingEmbedMessage, "source" | "type">,
): BookingEmbedMessage {
  return {
    source: BOOKING_EMBED_MESSAGE_SOURCE,
    type,
    ...extra,
  };
}
