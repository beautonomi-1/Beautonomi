/**
 * Browser Mapbox public token + style — single entry point for client code.
 * Calls GET /api/public/directions-config (mapbox_config + server-side env fallbacks).
 *
 * Falls back to `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` when the API returns no token (e.g. local dev).
 * (Server geocoding uses the secret via getMapboxService / platform_secrets.)
 */

export type MapboxPublicMapConfig = {
  accessToken: string | null;
  styleUrl: string | null;
  provider: "mapbox" | "google";
};

export async function fetchMapboxPublicMapConfig(): Promise<MapboxPublicMapConfig> {
  const envToken =
    typeof process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN === "string"
      ? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.trim()
      : "";
  try {
    const res = await fetch("/api/public/directions-config", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      data?: {
        provider?: string;
        mapboxPublicToken?: string;
        mapboxStyleUrl?: string | null;
      };
    };
    const data = json?.data;
    const raw = data?.mapboxPublicToken;
    const token = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    const styleRaw = data?.mapboxStyleUrl;
    const styleUrl =
      typeof styleRaw === "string" && styleRaw.trim() ? styleRaw.trim() : null;
    const accessToken = token || envToken || null;
    return {
      accessToken,
      styleUrl,
      provider: accessToken ? "mapbox" : "google",
    };
  } catch {
    const accessToken = envToken || null;
    return {
      accessToken,
      styleUrl: null,
      provider: accessToken ? "mapbox" : "google",
    };
  }
}
