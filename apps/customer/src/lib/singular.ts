/**
 * Singular SDK: attribution and smart links (open app if installed, else store).
 * Config: EXPO_PUBLIC_SINGULAR_SDK_KEY and EXPO_PUBLIC_SINGULAR_SDK_SECRET (EAS Secrets; never commit).
 * Link URLs are set in Admin → Settings → Apps; paste Singular Link URLs there.
 * Deep-link routing: register a handler from (app) layout; we map deeplink/urlParameters to Expo Router href.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { Singular, SingularConfig, type SingularLinkParams } from "singular-react-native";

function getSingularKey(): string {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  return extra?.EXPO_PUBLIC_SINGULAR_SDK_KEY ?? process.env.EXPO_PUBLIC_SINGULAR_SDK_KEY ?? "";
}

function getSingularSecret(): string {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  return extra?.EXPO_PUBLIC_SINGULAR_SDK_SECRET ?? process.env.EXPO_PUBLIC_SINGULAR_SDK_SECRET ?? "";
}

/** Params as plain object for route building */
function urlParamsFrom(params: SingularLinkParams): Record<string, string> {
  return params.urlParameters ? Object.fromEntries(params.urlParameters) : {};
}

/**
 * Build Expo Router href from Singular link params.
 * Supports deeplink path (e.g. /partner-profile, /cart) or urlParameters: screen, slug, id, product_id, booking_id, service_id, duration_minutes.
 */
export function buildCustomerRoute(params: SingularLinkParams): { pathname: string; params?: Record<string, string> } | null {
  const q = urlParamsFrom(params);
  const path = (params.deeplink ?? "").replace(/^\//, "").split("?")[0].toLowerCase();
  const screen = ((q.screen ?? path) || "").toLowerCase();

  if (screen === "cart" || path === "cart") {
    return { pathname: "/(app)/(tabs)/cart" };
  }
  if (screen === "partner-profile" || path === "partner-profile") {
    const slug = q.slug ?? q.provider_slug ?? "";
    if (!slug) return null;
    return { pathname: "/(app)/partner-profile", params: { slug } };
  }
  if (screen === "product-detail" || path === "product-detail") {
    const id = q.id ?? q.product_id ?? "";
    if (!id) return null;
    return { pathname: "/(app)/product-detail", params: { id } };
  }
  if (screen === "booking-detail" || path === "booking-detail") {
    const id = q.id ?? q.booking_id ?? "";
    if (!id) return null;
    return { pathname: "/(app)/booking-detail", params: { id } };
  }
  if (screen === "book" || path === "book") {
    const slug = q.slug ?? q.provider_slug ?? "";
    if (!slug) return null;
    const routeParams: Record<string, string> = { slug };
    if (q.service_id) routeParams.service_id = q.service_id;
    if (q.duration_minutes) routeParams.duration_minutes = q.duration_minutes;
    return { pathname: "/(app)/book", params: routeParams };
  }
  if (path.startsWith("book/l/") || screen === "book-l" || screen === "express-booking") {
    const linkSlug = q.link_slug ?? q.linkSlug ?? path.replace(/^book\/l\//i, "").split("?")[0] ?? "";
    if (!linkSlug) return null;
    const routeParams: Record<string, string> = { linkSlug };
    if (q.embed === "1") routeParams.embed = "1";
    return { pathname: "/(app)/book/l/[linkSlug]", params: routeParams };
  }
  if (path === "book/continue" || screen === "book-continue") {
    const holdId = q.hold_id ?? q.holdId ?? "";
    if (!holdId) return null;
    const routeParams: Record<string, string> = { hold_id: holdId };
    if (q.reschedule_booking_id) routeParams.reschedule_booking_id = q.reschedule_booking_id;
    return { pathname: "/(app)/book/continue", params: routeParams };
  }
  if (screen === "notifications" || path === "notifications") {
    return { pathname: "/(app)/notifications" };
  }
  if (screen === "profile" || path === "profile") {
    return { pathname: "/(app)/(tabs)/profile" };
  }
  if (screen === "home" || path === "home" || screen === "" || path === "") {
    return { pathname: "/(app)/(tabs)/home" };
  }
  if (screen === "account-settings" || path === "account-settings") {
    return { pathname: "/(app)/account-settings" };
  }
  if (screen === "help" || path === "help") {
    return { pathname: "/(app)/help" };
  }
  if (screen === "contact-support" || path === "contact-support") {
    return { pathname: "/(app)/(tabs)/support-tickets/new" };
  }
  if (
    screen === "support-tickets" ||
    path === "support-tickets" ||
    screen === "my-tickets" ||
    path === "my-tickets" ||
    path.startsWith("support-tickets/")
  ) {
    const fromPath = path.startsWith("support-tickets/")
      ? path.slice("support-tickets/".length).split("/")[0]?.trim() ?? ""
      : "";
    const ticketId = String(fromPath || q.id || q.ticket_id || "").trim();
    if (ticketId) {
      return { pathname: "/(app)/(tabs)/support-tickets/[id]", params: { id: ticketId } };
    }
    return { pathname: "/(app)/(tabs)/support-tickets" };
  }
  if (screen === "about" || path === "about") {
    return { pathname: "/(app)/about" };
  }
  if (screen === "product-orders" || path === "product-orders") {
    return { pathname: "/(app)/product-orders" };
  }
  if (screen === "review-write" || path === "review-write") {
    /** Must match `review-write` screen (`bookingId`); keep legacy query keys for old links. */
    const bookingId = String(q.bookingId ?? q.booking_id ?? q.id ?? "").trim();
    if (!bookingId) return { pathname: "/(app)/review-write" };
    return { pathname: "/(app)/review-write", params: { bookingId } };
  }
  if (screen === "bookings" || path === "bookings") {
    return { pathname: "/(app)/(tabs)/bookings" };
  }
  if (screen === "explore" || path === "explore") {
    return { pathname: "/(app)/(tabs)/explore" };
  }
  return null;
}

let pendingLink: SingularLinkParams | null = null;
let linkHandler: ((params: SingularLinkParams) => void) | null = null;

/**
 * Register the handler that performs navigation when a Singular link is opened.
 * Call from a component inside the navigation tree (e.g. (app) layout). If a link arrived before mount, it is delivered immediately.
 * Returns unsubscribe.
 */
export function registerSingularLinkHandler(handler: (params: SingularLinkParams) => void): () => void {
  linkHandler = handler;
  if (pendingLink) {
    handler(pendingLink);
    pendingLink = null;
  }
  return () => {
    linkHandler = null;
  };
}

function onSingularLink(params: SingularLinkParams) {
  if (__DEV__) {
    const urlParams = urlParamsFrom(params);
    console.log("[Singular] Link:", params.deeplink, "deferred:", params.isDeferred, "params:", urlParams);
  }
  pendingLink = params;
  if (linkHandler) {
    linkHandler(params);
    pendingLink = null;
  }
}

async function requestIosAttBeforeAttribution(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = await import(
      "expo-tracking-transparency"
    );
    const { status } = await getTrackingPermissionsAsync();
    if (status === "undetermined") {
      await requestTrackingPermissionsAsync();
    }
  } catch {
    // Expo Go / missing native module — Singular still initializes without IDFA until next launch
  }
}

/**
 * Initialize Singular. Call once at app startup (root layout).
 * No-op on web or when key/secret missing.
 * On iOS, requests App Tracking Transparency before init when status is undetermined (store requirement with Singular).
 */
export function initSingular() {
  if (Platform.OS === "web") return;

  const apikey = getSingularKey();
  const secret = getSingularSecret();
  if (!apikey || !secret) return;

  void (async () => {
    await requestIosAttBeforeAttribution();
    try {
      const config = new SingularConfig(apikey, secret).withSingularLink(onSingularLink);
      Singular.init(config);
    } catch (e) {
      if (__DEV__) {
        console.warn("[Singular] Init failed:", e);
      }
    }
  })();
}
