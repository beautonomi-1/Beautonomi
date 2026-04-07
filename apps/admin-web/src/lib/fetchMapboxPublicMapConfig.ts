/**
 * Browser Mapbox public token — proxied to Next `/api/public/directions-config`.
 */
export type MapboxPublicMapConfig = {
  accessToken: string | null;
  styleUrl: string | null;
};

export async function fetchMapboxPublicMapConfig(): Promise<MapboxPublicMapConfig> {
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
    return { accessToken: token, styleUrl };
  } catch {
    return { accessToken: null, styleUrl: null };
  }
}
