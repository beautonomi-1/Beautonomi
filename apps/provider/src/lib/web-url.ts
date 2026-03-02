import { Platform } from "react-native";
import { APP_URL } from "@/config/public-env";

/**
 * Web provider portal base URL for "Open on web" links.
 * On Expo web (localhost:8081/8082) uses Next.js at :3000; otherwise APP_URL or fallback.
 */
export function getWebProviderBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin === "http://localhost:8081" || origin === "http://localhost:8082") {
      return "http://localhost:3000";
    }
    return origin;
  }
  return APP_URL?.trim() || "https://app.beautonomi.com";
}
