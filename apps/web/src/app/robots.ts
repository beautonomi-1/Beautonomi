import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
  
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
