import type { Metadata } from "next";
import { fetchExplorePost } from "@/lib/explore/fetch-posts";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import ExplorePostPageClient from "./ExplorePostPageClient";

export const revalidate = 300;

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0] ?? "";
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchExplorePost(id);
  const origin = await getPublicSiteOriginFromHeaders();
  const canonical = `/explore/${id}`;

  if (!post) {
    return {
      title: "Post not found | Beautonomi",
      description: "This explore post is unavailable on Beautonomi.",
      alternates: { canonical, languages: getHreflangAlternateUrls(canonical) },
    };
  }

  const providerName = post.provider?.business_name || "Beautonomi provider";
  const captionSnippet = post.caption?.trim()
    ? post.caption.trim().slice(0, 155) + (post.caption.length > 155 ? "…" : "")
    : `Beauty inspiration from ${providerName}`;
  const title = post.caption?.trim()
    ? `${post.caption.trim().slice(0, 60)}${post.caption.length > 60 ? "…" : ""} | Beautonomi`
    : `${providerName} on Beautonomi Explore`;
  const description = `${captionSnippet} — Discover on Beautonomi Explore.`;
  const pageUrl = `${origin}${canonical}`;
  const primaryMedia = post.media_urls?.[0];
  const ogImages =
    primaryMedia && !isVideoUrl(primaryMedia)
      ? [{ url: primaryMedia, width: 1200, height: 1500, alt: post.caption || `${providerName} on Beautonomi` }]
      : undefined;

  return {
    title,
    description,
    alternates: { canonical, languages: getHreflangAlternateUrls(canonical) },
    openGraph: {
      type: primaryMedia && isVideoUrl(primaryMedia) ? "video.other" : "article",
      title,
      description,
      url: pageUrl,
      siteName: "Beautonomi",
      images: ogImages,
      ...(primaryMedia && isVideoUrl(primaryMedia)
        ? { videos: [{ url: primaryMedia }] }
        : {}),
    },
    twitter: {
      card: ogImages ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImages?.map((i) => i.url),
    },
  };
}

export default function ExplorePostPage() {
  return <ExplorePostPageClient />;
}
