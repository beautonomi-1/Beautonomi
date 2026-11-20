import { isSafeRelativeRedirect } from "@/lib/auth/post-login-return-path";

export type ExploreCardContent = {
  title: string;
  description: string;
  href: string;
};

export const HELP_EXPLORE_DEFAULT_CARDS: ExploreCardContent[] = [
  {
    title: "Our community policies",
    description: "How we build a foundation of trust.",
    href: "/learn/policies",
  },
  {
    title: "Provider resources and inspiration",
    description: "Find tips, best practices, and news for providers.",
    href: "/learn/provider",
  },
];

const MAX_EXPLORE_CARDS = 2;

function sectionText(
  content: Record<string, { content?: string }> | null | undefined,
  key: string,
): string {
  return content?.[key]?.content?.trim() ?? "";
}

function resolveOneCard(
  item: { title?: string; description?: string; href?: string },
  fallback: ExploreCardContent,
): ExploreCardContent {
  const title = (item.title?.trim() || fallback.title).trim();
  const description = (item.description?.trim() || fallback.description).trim();
  let href = item.href?.trim() ?? "";
  if (!isSafeRelativeRedirect(href)) {
    href = fallback.href;
  }
  return { title, description, href };
}

/**
 * Merge CMS explore cards with defaults: at least two cards when defaults exist,
 * pad missing default hrefs, cap at MAX_EXPLORE_CARDS.
 */
export function resolveExploreCards(
  content: Record<string, { content?: string }> | null | undefined,
): ExploreCardContent[] {
  const raw = sectionText(content, "explore_cards");
  let cmsItems: Array<{ title?: string; description?: string; href?: string }> = [];

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        cmsItems = parsed as Array<{ title?: string; description?: string; href?: string }>;
      }
    } catch {
      cmsItems = [];
    }
  }

  const resolved: ExploreCardContent[] =
    cmsItems.length === 0
      ? [...HELP_EXPLORE_DEFAULT_CARDS]
      : cmsItems.map((item, index) => {
          const fallback =
            HELP_EXPLORE_DEFAULT_CARDS[index] ??
            HELP_EXPLORE_DEFAULT_CARDS[HELP_EXPLORE_DEFAULT_CARDS.length - 1];
          return resolveOneCard(item, fallback);
        });

  for (const def of HELP_EXPLORE_DEFAULT_CARDS) {
    if (resolved.length >= MAX_EXPLORE_CARDS) break;
    if (!resolved.some((c) => c.href === def.href)) {
      resolved.push({ ...def });
    }
  }

  return resolved.slice(0, MAX_EXPLORE_CARDS);
}

export function exploreCardImageKey(href: string): "/learn/policies" | "/learn/provider" | "other" {
  if (href === "/learn/policies" || href.includes("/policies")) return "/learn/policies";
  if (href === "/learn/provider" || href.includes("/provider")) return "/learn/provider";
  return "other";
}