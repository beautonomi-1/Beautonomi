"use client";

import { useTranslation } from "@beautonomi/i18n";
import type { ExplorePost } from "@/types/explore";
import { providerExplorePostBadge } from "@/lib/explore/provider-explore-post-status";

export function ProviderExplorePostStatusBadge({ post }: { post: ExplorePost }) {
  const { t } = useTranslation();
  const badge = providerExplorePostBadge({
    is_hidden: post.is_hidden,
    media_urls: post.media_urls,
    media_meta: post.media_meta,
  });
  if (!badge) return null;

  const label =
    badge === "hidden"
      ? t("web.provider.explorePage.statusHidden")
      : badge === "video_failed"
        ? t("web.provider.explorePage.statusVideoFailed")
        : t("web.provider.explorePage.statusVideoProcessing");

  const className =
    badge === "hidden"
      ? "bg-red-100 text-red-800"
      : badge === "video_failed"
        ? "bg-orange-100 text-orange-900"
        : "bg-blue-100 text-blue-900";

  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${className}`}>{label}</span>;
}
