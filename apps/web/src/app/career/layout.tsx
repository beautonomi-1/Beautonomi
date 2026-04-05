import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getCareerSeoMetadata } from "@/lib/cms/careers-page-server";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import {
  getPublicSiteOriginFromHeaders,
  openGraphLocaleForHost,
} from "@/lib/seo/public-site-origin";

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await getCareerSeoMetadata();
  const origin = await getPublicSiteOriginFromHeaders();
  const path = "/career";
  const h = await headers();
  const hostRaw =
    (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0] || "";

  return {
    title,
    description,
    alternates: {
      canonical: `${origin}${path}`,
      languages: getHreflangAlternateUrls(path),
    },
    openGraph: {
      title,
      description,
      siteName: "Beautonomi",
      url: `${origin}${path}`,
      locale: openGraphLocaleForHost(hostRaw),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function CareerLayout({ children }: { children: ReactNode }) {
  return children;
}
