/**
 * Singular SDK: attribution and smart links (open app if installed, else store).
 * Config: EXPO_PUBLIC_SINGULAR_SDK_KEY and EXPO_PUBLIC_SINGULAR_SDK_SECRET (EAS Secrets; never commit).
 * Link URLs are set in Admin → Settings → Apps (provider); paste Singular Link URLs there.
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

function urlParamsFrom(params: SingularLinkParams): Record<string, string> {
  return params.urlParameters ? Object.fromEntries(params.urlParameters) : {};
}

/**
 * Build Expo Router href from Singular link params for the provider app.
 * Supports urlParameters: screen, id (chat_id, booking_id, etc.).
 *
 * Onboarding:
 * - Hub: screen=onboarding or deeplink path `onboarding`
 * - Native wizard: screen=onboarding-wizard | onboarding_wizard, or path
 *   `onboarding/wizard` | `onboarding-wizard` | `onboarding_wizard`
 */
export function buildProviderRoute(params: SingularLinkParams): { pathname: string; params?: Record<string, string> } | null {
  const q = urlParamsFrom(params);
  const path = (params.deeplink ?? "").replace(/^\//, "").split("?")[0].toLowerCase();
  const screen = ((q.screen ?? path) || "").toLowerCase();

  if (screen === "notifications" || path === "notifications") {
    return { pathname: "/(app)/notifications" };
  }
  if (screen === "search" || path === "search") {
    return { pathname: "/(app)/search" };
  }
  if (screen === "chat" || path === "chat") {
    const id = q.id ?? q.chat_id ?? "";
    if (!id) return null;
    return { pathname: "/(app)/chat/[id]", params: { id } };
  }
  if (screen === "on-demand" || path === "on-demand" || path === "on-demand/incoming") {
    const id = q.id ?? q.request_id ?? "";
    if (!id) return null;
    return { pathname: "/(app)/on-demand/incoming/[id]", params: { id } };
  }
  if (screen === "onboarding" || path === "onboarding") {
    return { pathname: "/(app)/onboarding" };
  }
  if (
    screen === "onboarding-wizard" ||
    screen === "onboarding_wizard" ||
    path === "onboarding/wizard" ||
    path === "onboarding-wizard" ||
    path === "onboarding_wizard"
  ) {
    return { pathname: "/(app)/onboarding/wizard" };
  }
  if (screen === "dashboard" || path === "dashboard" || screen === "home" || path === "" || screen === "") {
    return { pathname: "/(app)/(tabs)/dashboard" };
  }
  if (screen === "calendar" || path === "calendar") {
    return { pathname: "/(app)/(tabs)/bookings" };
  }
  if (screen === "bookings" || path === "bookings") {
    const id = q.id ?? q.booking_id ?? "";
    return id
      ? { pathname: "/(app)/(tabs)/bookings/[id]", params: { id } }
      : { pathname: "/(app)/(tabs)/bookings" };
  }
  if (screen === "group-bookings" || screen === "group_bookings" || path === "group-bookings") {
    // §Group-booking-audit 2026-05: prefer `group_booking_id` / `open_group_id`
    // over the generic `id` query param because notification deep links and
    // bookings calendar rows pass a normal booking id under `id`. Falling back
    // to `id` last keeps legacy share links working but stops the screen from
    // trying to fetch a group booking with a participant booking id (which
    // returns 404).
    const open_group_id = q.group_booking_id ?? q.open_group_id ?? q.id ?? "";
    return open_group_id
      ? { pathname: "/(app)/(tabs)/more/group-bookings", params: { open_group_id } }
      : { pathname: "/(app)/(tabs)/more/group-bookings" };
  }
  if (screen === "waiting-room" || screen === "waiting_room" || path === "waiting-room") {
    return { pathname: "/(app)/(tabs)/more/waiting-room" };
  }
  if (screen === "express-booking" || screen === "express_booking" || path === "express-booking") {
    return { pathname: "/(app)/(tabs)/more/express-booking" };
  }
  if (screen === "packages" || path === "packages") {
    return { pathname: "/(app)/(tabs)/more/packages-list" };
  }
  if (screen === "reports" || path === "reports") {
    return { pathname: "/(app)/(tabs)/more/reports" };
  }
  if (screen === "clients" || path === "clients") {
    return { pathname: "/(app)/(tabs)/clients" };
  }
  if (screen === "chats" || path === "chats") {
    return { pathname: "/(app)/(tabs)/chats" };
  }
  if (screen === "more" || path === "more") {
    return { pathname: "/(app)/(tabs)/more" };
  }
  if (
    screen === "ads" ||
    screen === "paid-ads" ||
    screen === "paid_ads" ||
    path === "settings/ads" ||
    path === "ads"
  ) {
    return { pathname: "/(app)/(tabs)/more/settings/ads" };
  }
  return null;
}

let pendingLink: SingularLinkParams | null = null;
let linkHandler: ((params: SingularLinkParams) => void) | null = null;

/**
 * Register the handler that performs navigation when a Singular link is opened.
 * Call from a component inside the navigation tree (e.g. (app) layout).
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

/**
 * Initialize Singular. Call from AttTrackingBootstrap after ATT completes.
 * No-op on web. Requires keys in EAS secrets.
 */
export function initSingular() {
  if (Platform.OS === "web") return;

  try {
    const apikey = getSingularKey();
    const secret = getSingularSecret();
    if (!apikey || !secret) return;

    const config = new SingularConfig(apikey, secret).withSingularLink(onSingularLink);
    Singular.init(config);
  } catch (e) {
    if (__DEV__) {
      console.warn("[Singular] Init failed:", e);
    }
  }
}
