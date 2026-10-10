import type { Metadata } from "next";
import { fetchExplorePost } from "@/lib/explore/fetch-posts";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { hreflangForPath } from "@/lib/seo/metadata-hreflang";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";
import ExplorePostPageClient from "./ExplorePostPageClient";
import { firstSlideIsVideo, resolveExploreVideoSrc } from "@/lib/explore/video-media";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchExplorePost(id);
  const origin = await getPublicSiteOriginFromHeaders();
  const canonical = `/explore/${id}`;
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);

  if (!post) {
    return {
      title: t("web.seo.exploreNotFoundTitle") as string,
      description: t("web.seo.exploreNotFoundDescription") as string,
      alternates: { canonical, languages: await hreflangForPath(canonical) },
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
  const videoFirst = firstSlideIsVideo(post.media_urls, post.media_meta);
  const ogImageUrl = post.display_url ?? post.media_urls?.[0];
  const ogWidth = post.media_width ?? 1200;
  const ogHeight = post.media_height ?? 1500;
  const ogImages =
    ogImageUrl && !videoFirst
      ? [{ url: ogImageUrl, width: ogWidth, height: ogHeight, alt: post.caption || `${providerName} on Beautonomi` }]
      : ogImageUrl
        ? [{ url: ogImageUrl, width: ogWidth, height: ogHeight, alt: post.caption || `${providerName} on Beautonomi` }]
        : undefined;
  const ogVideoUrl = videoFirst
    ? resolveExploreVideoSrc({
        mediaUrls: post.media_urls ?? [],
        playbackPath: post.playback_path,
        mediaMeta: post.media_meta,
      })
    : null;

  return {
    title,
    description,
    alternates: { canonical, languages: await hreflangForPath(canonical) },
    openGraph: {
      type: videoFirst ? "video.other" : "article",
      title,
      description,
      url: pageUrl,
      siteName: "Beautonomi",
      images: ogImages,
      ...(ogVideoUrl ? { videos: [{ url: ogVideoUrl, width: ogWidth, height: ogHeight }] } : {}),
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
