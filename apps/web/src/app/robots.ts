import { MetadataRoute } from "next";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { isAdminHostRequest } from "@/lib/seo/admin-host";

/** Host-accurate sitemap URL in robots.txt (multi-domain on one deployment). */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (await isAdminHostRequest()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  const baseUrl = await getPublicSiteOriginFromHeaders();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          /** All admin roles (incl. superadmin) use `/admin` — keep disallowed for crawlers */
          "/admin/",
          "/provider/",
          "/account-settings/",
          "/booking/",
          "/portal/",
          "/checkout/",
          "/*?payment_success=",
          "/*?in_app=",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
