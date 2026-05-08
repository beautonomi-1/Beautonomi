import { useEffect } from "react";
import { Linking, Platform } from "react-native";
import { useRouter, type Href } from "expo-router";
import { isScreenshotMode, SCREENSHOT_BOOKING_ID } from "@/config/public-env";

const SCHEME = "provider://";

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
  const bookingId = (query.id || query.booking_id || SCREENSHOT_BOOKING_ID).trim();

  switch (p) {
    case "auth/login":
      return "/(auth)/login";
    case "tabs/dashboard":
      return "/(app)/(tabs)/dashboard";
    case "tabs/calendar":
      return "/(app)/(tabs)/bookings";
    case "tabs/clients":
      return "/(app)/(tabs)/clients";
    case "tabs/more":
      return "/(app)/(tabs)/more";
    case "more/bookings":
      return "/(app)/(tabs)/bookings";
    case "more/booking-detail": {
      if (!bookingId) return null;
      return { pathname: "/(app)/(tabs)/bookings/[id]", params: { id: bookingId } };
    }
    case "more/service-form":
      return "/(app)/(tabs)/more/service-form";
    case "more/my-earnings":
      return "/(app)/(tabs)/more/my-earnings";
    case "more/finance-hub":
      return "/(app)/(tabs)/more/finance";
    case "more/reports":
      return "/(app)/(tabs)/more/reports";
    case "more/profile":
      return "/(app)/(tabs)/more/profile";
    case "more/catalogue":
      return "/(app)/(tabs)/more/catalogue";
    case "more/settings/business":
      return "/(app)/(tabs)/more/settings/business";
    default:
      return null;
  }
}

/**
 * Handles `provider://screenshot/...` only when {@link isScreenshotMode} is true.
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
