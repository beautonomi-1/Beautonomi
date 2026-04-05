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
    return { pathname: "/(app)/(tabs)/calendar" };
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
