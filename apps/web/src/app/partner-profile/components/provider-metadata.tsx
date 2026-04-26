"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { openGraphLocaleTagForHost } from "@/lib/seo/host-config";
import {
  resolvePartnerProfileOpenGraphImageUrl,
  type PartnerProfileOgMedia,
} from "@/lib/seo/partner-profile-open-graph";

/**
 * Client component to inject dynamic Open Graph meta tags for provider profiles
 * This ensures WhatsApp, Facebook, Twitter, etc. show the correct preview image
 */
export default function ProviderMetadata({ 
  provider 
}: { 
  provider: (PartnerProfileOgMedia & {
    business_name?: string;
    description?: string | null;
    slug?: string;
    rating?: number;
    review_count?: number;
    city?: string;
    country?: string;
  }) | null;
}) {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");

  useEffect(() => {
    if (!provider || !slug) return;

    const siteUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://beautonomi.com");
    const profileUrl = `${siteUrl}/partner-profile?slug=${encodeURIComponent(slug)}`;

    let slugDecoded = slug;
    try {
      slugDecoded = decodeURIComponent(slug);
    } catch {
      slugDecoded = slug;
    }
    const ogImage = resolvePartnerProfileOpenGraphImageUrl(siteUrl, slugDecoded, provider);

    const title = `${provider.business_name || "Provider"} | Beautonomi`;
    const locationText = provider.city && provider.country 
      ? `${provider.city}, ${provider.country}`
      : provider.city || provider.country || "";
    
    const description = provider.description 
      ? `${provider.description.substring(0, 155)}${provider.description.length > 155 ? "..." : ""}`
      : `Discover ${provider.business_name || "this provider"} on Beautonomi${locationText ? ` in ${locationText}` : ""}. ${provider.rating ? `Rated ${provider.rating.toFixed(1)}/5` : ""}${provider.review_count ? ` with ${provider.review_count} reviews` : ""}.`;

    // Update or create meta tags
    const updateMetaTag = (property: string, content: string, isProperty = true) => {
      const attribute = isProperty ? "property" : "name";
      let meta = document.querySelector(`meta[${attribute}="${property}"]`);
      
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attribute, property);
        document.head.appendChild(meta);
      }
      
      meta.setAttribute("content", content);
    };

    // Open Graph tags
    updateMetaTag("og:title", title);
    updateMetaTag("og:description", description);
    updateMetaTag("og:url", profileUrl);
    updateMetaTag("og:image", ogImage);
    updateMetaTag("og:image:width", "1200");
    updateMetaTag("og:image:height", "630");
    updateMetaTag("og:image:alt", `${provider.business_name || "Provider"} on Beautonomi`);
    updateMetaTag("og:type", "website");
    updateMetaTag("og:site_name", "Beautonomi");
    updateMetaTag(
      "og:locale",
      typeof window !== "undefined"
        ? openGraphLocaleTagForHost(window.location.hostname)
        : "en_US",
    );

    // Twitter Card tags
    updateMetaTag("twitter:card", "summary_large_image", false);
    updateMetaTag("twitter:title", title, false);
    updateMetaTag("twitter:description", description, false);
    updateMetaTag("twitter:image", ogImage, false);

    // Update page title
    document.title = title;

    // Update canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", profileUrl);

    // JSON-LD: use thumbnail for image; use avatar_url as logo (distinct face/logo) when present
    const toAbsolute = (url: string) => {
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      if (url.startsWith("/")) return `${siteUrl}${url}`;
      return url;
    };
    const schema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: provider.business_name || "Provider",
      url: profileUrl,
      description: provider.description || undefined,
      image: ogImage,
    };
    if (provider.avatar_url) {
      schema.logo = toAbsolute(provider.avatar_url);
    }
    if (provider.rating != null) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: provider.rating,
        reviewCount: provider.review_count ?? 0,
      };
    }
    let schemaEl = document.getElementById("provider-jsonld") as HTMLScriptElement | null;
    if (!schemaEl) {
      schemaEl = document.createElement("script");
      schemaEl.id = "provider-jsonld";
      schemaEl.type = "application/ld+json";
      document.head.appendChild(schemaEl);
    }
    schemaEl.textContent = JSON.stringify(schema);

    return () => {};
  }, [provider, slug]);

  return null; // This component doesn't render anything
}
