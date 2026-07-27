import type { ExplorePost } from "@/types/explore";
import { captionHasSensitiveTerms, SENSITIVE_EXPLORE_TAGS } from "./require-social-access";

type PostLike = {
  caption?: string | null;
  tags?: string[] | null;
};

export function postHasSensitiveContent(post: PostLike): boolean {
  if (captionHasSensitiveTerms(post.caption)) return true;
  const tags = post.tags ?? [];
  return tags.some((t) =>
    SENSITIVE_EXPLORE_TAGS.some((s) => t.toLowerCase().includes(s)),
  );
}

export function filterExplorePostsForViewer<T extends PostLike>(
  posts: T[],
  options: { hideSocialFeed: boolean; sensitiveFilter: boolean },
): T[] {
  if (options.hideSocialFeed) return [];
  if (!options.sensitiveFilter) return posts;
  return posts.filter((p) => !postHasSensitiveContent(p));
}

export function mapExplorePostsWithSafety<T extends ExplorePost>(
  posts: T[],
  options: { hideSocialFeed: boolean; sensitiveFilter: boolean },
): T[] {
  return filterExplorePostsForViewer(posts, options);
}
