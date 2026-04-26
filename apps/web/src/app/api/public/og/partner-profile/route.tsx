import { ImageResponse } from "next/og";
import { getPublicProviderDetail } from "@/lib/data/getPublicProviderDetail";
import {
  isSocialPreviewRasterUrl,
  toAbsolutePublicUrl,
} from "@/lib/seo/partner-profile-open-graph";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";

export const runtime = "nodejs";

/**
 * Public dynamic 1200×630 PNG for partner profiles when there is no raster thumbnail
 * (WhatsApp and most crawlers ignore SVG og:image).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slugRaw = searchParams.get("slug")?.trim();
  if (!slugRaw) {
    return new Response("Missing slug", { status: 400 });
  }
  let slugDecoded = slugRaw;
  try {
    slugDecoded = decodeURIComponent(slugRaw);
  } catch {
    slugDecoded = slugRaw;
  }

  const origin = await getPublicSiteOriginFromHeaders();
  const { provider } = await getPublicProviderDetail(slugDecoded);

  const businessName = provider?.business_name?.trim() || "Partner on Beautonomi";

  const candidates = [
    provider?.thumbnail_url,
    provider?.avatar_url,
    ...(Array.isArray(provider?.gallery) ? provider.gallery : []),
  ];
  for (const c of candidates) {
    const abs = toAbsolutePublicUrl(origin, c);
    if (abs && isSocialPreviewRasterUrl(abs)) {
      try {
        return new ImageResponse(
          (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                background: "#0f172a",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- next/og remote image */}
              <img src={abs} alt="" width={1200} height={630} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
            </div>
          ),
          { width: 1200, height: 630 },
        );
      } catch {
        break;
      }
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #FF0077 0%, #9d0050 55%, #1e1b4b 100%)",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "white",
            letterSpacing: -1,
            marginBottom: 28,
          }}
        >
          Beautonomi
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: "white",
            textAlign: "center",
            paddingLeft: 72,
            paddingRight: 72,
            lineHeight: 1.25,
            maxHeight: 280,
            overflow: "hidden",
          }}
        >
          {businessName}
        </div>
        <div style={{ fontSize: 24, color: "rgba(255,255,255,0.88)", marginTop: 36 }}>Book on Beautonomi</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
