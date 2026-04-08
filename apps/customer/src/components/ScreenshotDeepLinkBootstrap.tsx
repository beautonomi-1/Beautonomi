import { useEffect } from "react";
import { Linking, Platform } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  isScreenshotMode,
  SCREENSHOT_BOOKING_ID,
  SCREENSHOT_HOLD_ID,
  SCREENSHOT_PROVIDER_ID,
  SCREENSHOT_PROVIDER_SLUG,
} from "@/config/public-env";

const SCHEME = "customer://";

function parseUrl(url: string): { path: string; query: Record<string, string> } | null {
  if (!url.startsWith(SCHEME)) return null;
  const rest = url.slice(SCHEME.length);
  const [pathPart, queryPart = ""] = rest.split("?");
  const path = pathPart.replace(/^\/+/, "");
  const query: Record<string, string> = {};
  new URLSearchParams(queryPart).forEach((v, k) => {
    query[k] = v;
  });
  return { path, query };
}

function resolveScreenshotHref(path: string, query: Record<string, string>): Href | null {
  if (!path.startsWith("screenshot/")) return null;
  const p = path.slice("screenshot/".length);

  const slug = (query.slug || SCREENSHOT_PROVIDER_SLUG).trim();
  const providerId = (query.provider_id || SCREENSHOT_PROVIDER_ID).trim();
  const bookingId = (query.id || query.booking_id || SCREENSHOT_BOOKING_ID).trim();
  const holdId = (query.hold_id || SCREENSHOT_HOLD_ID).trim();

  switch (p) {
    case "auth/login":
      return "/(auth)/login";
    case "auth/signup":
      return "/(auth)/signup";
    case "tabs/home":
      return "/(app)/(tabs)/home";
    case "tabs/explore":
      return "/(app)/(tabs)/explore";
    case "tabs/bookings":
      return "/(app)/(tabs)/bookings";
    case "tabs/profile":
      return "/(app)/(tabs)/profile";
    case "tabs/saved":
      return "/(app)/(tabs)/saved";
    case "partner-profile": {
      if (slug) return { pathname: "/(app)/partner-profile", params: { slug } };
      if (providerId) return { pathname: "/(app)/partner-profile", params: { provider_id: providerId } };
      return null;
    }
    case "book": {
      if (slug) return { pathname: "/(app)/book", params: { slug } };
      if (providerId) return { pathname: "/(app)/book", params: { provider_id: providerId } };
      return null;
    }
    case "book-checkout": {
      if (!holdId) return null;
      return { pathname: "/(app)/book-checkout", params: { hold_id: holdId } };
    }
    case "cart":
      return "/(app)/(tabs)/cart";
    case "shop":
      return "/(app)/(tabs)/shop";
    case "product-checkout":
      return "/(app)/(tabs)/shop/product-checkout";
    case "booking-detail": {
      if (!bookingId) return null;
      return { pathname: "/(app)/booking-detail", params: { id: bookingId } };
    }
    case "account-settings":
      return "/(app)/account-settings";
    default:
      return null;
  }
}

/**
 * Handles `customer://screenshot/...` only when {@link isScreenshotMode} is true.
 * Mounted from root layout so links work before/(auth) and (app) mounts settle.
 */
export function ScreenshotDeepLinkBootstrap() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web" || !isScreenshotMode()) return;

    const handle = (url: string | null) => {
      if (!url) return;
      const parsed = parseUrl(url);
      if (!parsed) return;
      const href = resolveScreenshotHref(parsed.path, parsed.query);
      if (!href) return;
      requestAnimationFrame(() => router.replace(href as never));
    };

    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, [router]);

  return null;
}
