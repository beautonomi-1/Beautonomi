import { MetadataRoute } from "next";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";

/** Host-accurate sitemap URL in robots.txt (multi-domain on one deployment). */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await getPublicSiteOriginFromHeaders();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/provider/",
          "/account-settings/",
          "/booking/",
          "/portal/",
          "/checkout/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
