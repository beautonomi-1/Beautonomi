import { NextRequest, NextResponse } from "next/server";
import { getMapboxAccessToken } from "@/lib/platform/secrets";
import { optionalAuthInApi } from "@/lib/supabase/api-helpers";
import { checkMapboxRateLimit } from "@/lib/rate-limit/mapbox";

const MAX_DIM = 800;
const MIN_DIM = 1;

function parseFiniteNumber(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Allow only Mapbox style paths like `mapbox/streets-v12` (no URL injection). */
function sanitizeStylePath(raw: string | null): string {
  const fallback = "mapbox/streets-v12";
  if (!raw || !raw.trim()) return fallback;
  const s = raw.trim();
  if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(s)) return fallback;
  return s;
}

function buildStaticImageUrl(params: {
  stylePath: string;
  lat: number;
  lng: number;
  secLat?: number;
  secLng?: number;
  w: number;
  h: number;
  accessToken: string;
}): string {
  const { stylePath, lat, lng, secLat, secLng, w, h, accessToken } = params;
  const pin = `pin-l+FF0077(${lng},${lat})`;
  const hasSecondary =
    secLat != null &&
    secLng != null &&
    Number.isFinite(secLat) &&
    Number.isFinite(secLng) &&
    !(Math.abs(secLat - lat) < 1e-6 && Math.abs(secLng - lng) < 1e-6);

  /** Always include pin overlay(s); use `auto` camera so the marker stays in frame (Mapbox picks zoom). */
  let overlay: string;
  const frame = "auto";
  if (hasSecondary) {
    const pinB = `pin-l+2563EB(${secLng!},${secLat!})`;
    overlay = `${pin},${pinB}`;
  } else {
    overlay = pin;
  }

  return `https://api.mapbox.com/styles/v1/${stylePath}/static/${overlay}/${frame}/${w}x${h}@2x?access_token=${encodeURIComponent(accessToken)}`;
}

/**
 * GET /api/mapbox/static-image
 *
 * Proxies Mapbox Static Images API using the server-side token so native apps
 * can show previews when only the secret token is configured (no public token).
 */
export async function GET(request: NextRequest) {
  const { user } = await optionalAuthInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
  const rateLimitResponse = await checkMapboxRateLimit(request, user?.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const url = new URL(request.url);
    const lat = parseFiniteNumber(url.searchParams.get("lat"));
    const lng = parseFiniteNumber(url.searchParams.get("lng"));
    if (lat == null || lng == null) {
      return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: "coordinates out of range" }, { status: 400 });
    }

    let w = Math.round(parseFiniteNumber(url.searchParams.get("w")) ?? 400);
    let h = Math.round(parseFiniteNumber(url.searchParams.get("h")) ?? 200);
    w = Math.min(MAX_DIM, Math.max(MIN_DIM, w));
    h = Math.min(MAX_DIM, Math.max(MIN_DIM, h));

    const secLat = parseFiniteNumber(url.searchParams.get("sec_lat"));
    const secLng = parseFiniteNumber(url.searchParams.get("sec_lng"));

    const token = (await getMapboxAccessToken())?.trim();
    if (!token) {
      return NextResponse.json({ error: "Mapbox is not configured" }, { status: 503 });
    }

    const stylePath = sanitizeStylePath(url.searchParams.get("style"));
    const mapboxUrl = buildStaticImageUrl({
      stylePath,
      lat,
      lng,
      secLat: secLat ?? undefined,
      secLng: secLng ?? undefined,
      w,
      h,
      accessToken: token,
    });

    const upstream = await fetch(mapboxUrl, { next: { revalidate: 0 } });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Upstream map request failed", status: upstream.status },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const buf = await upstream.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e) {
    console.error("[static-image]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

