import { Platform } from "react-native";
import { APP_URL, getBackendUrl } from "@/config/public-env";

/**
 * Customer web app base URL (Next.js) for Paystack HTTPS return bridges.
 * Expo web on localhost:8081/8082 → Next at :3000; native uses configured APP_URL / LAN dev host.
 */
export function getWebCustomerBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin === "http://localhost:8081" || origin === "http://localhost:8082") {
      return "http://localhost:3000";
    }
    return origin;
  }
  const backend = getBackendUrl()?.trim();
  if (backend) return backend.replace(/\/$/, "");
  return APP_URL?.trim()?.replace(/\/$/, "") || "https://app.beautonomi.com";
}
