"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Client component to inject dynamic Open Graph meta tags for provider profiles
 * This ensures WhatsApp, Facebook, Twitter, etc. show the correct preview image
 */
export default function ProviderMetadata({ 
  provider 
}: { 
  provider: {
    business_name?: string;
    description?: string | null;
    thumbnail_url?: string | null;
    slug?: string;
    rating?: number;
    review_count?: number;
    city?: string;
    country?: string;
  } | null 
}) {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");

  useEffect(() => {
    if (!provider || !slug) return;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                    (typeof window !== "undefined" ? window.location.origin : "https://beautonomi.com");
    const profileUrl = `${siteUrl}/partner-profile?slug=${encodeURIComponent(slug)}`;
    
    // Get thumbnail image - use absolute URL for Open Graph
    let ogImage = `${siteUrl}/images/logo-beatonomi.svg`; // Default fallback
    if (provider.thumbnail_url) {
      // If thumbnail_url is already absolute, use it; otherwise make it absolute
      if (provider.thumbnail_url.startsWith("http://") || provider.thumbnail_url.startsWith("https://")) {
        ogImage = provider.thumbnail_url;
      } else if (provider.thumbnail_url.startsWith("/")) {
        ogImage = `${siteUrl}${provider.thumbnail_url}`;
      } else {
        // If it's a Supabase storage URL, it should already be absolute
        ogImage = provider.thumbnail_url;
      }
    }

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
    updateMetaTag("og:locale", "en_US");

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

    // Cleanup function (optional, but good practice)
    return () => {
      // Optionally reset to defaults on unmount
    };
  }, [provider, slug]);

  return null; // This component doesn't render anything
}
