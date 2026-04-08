import { publicEnv } from "@/config/publicEnv";

/**
 * Browser Mapbox public token — proxied to Next `/api/public/directions-config`.
 * Falls back to `VITE_MAPBOX_ACCESS_TOKEN` / `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (see vite `define`) when the API returns no token (e.g. local dev without DB row).
 */
export type MapboxPublicMapConfig = {
  accessToken: string | null;
  styleUrl: string | null;
};

export async function fetchMapboxPublicMapConfig(): Promise<MapboxPublicMapConfig> {
  const envToken = typeof publicEnv.mapboxAccessToken === "string" ? publicEnv.mapboxAccessToken.trim() : "";
  try {
    const res = await fetch("/api/public/directions-config", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { mapboxPublicToken?: string; mapboxStyleUrl?: string | null };
    };
    const data = json?.data;
    const raw = data?.mapboxPublicToken;
    const token = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    const styleRaw = data?.mapboxStyleUrl;
    const styleUrl = typeof styleRaw === "string" && styleRaw.trim() ? styleRaw.trim() : null;
    return { accessToken: token || envToken || null, styleUrl };
  } catch {
    return { accessToken: envToken || null, styleUrl: null };
  }
}
