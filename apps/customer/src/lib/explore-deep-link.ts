/**
 * Resolve an explore post id from customer scheme or marketing-site universal links.
 * Supports:
 * - customer://explore-post?id={uuid}
 * - https://beautonomi.com/explore/{uuid}
 * - https://www.beautonomi.co.za/explore/{uuid}
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXPLORE_WEB_HOSTS = new Set([
  "beautonomi.com",
  "www.beautonomi.com",
  "beautonomi.co.za",
  "www.beautonomi.co.za",
  "localhost",
  "127.0.0.1",
]);

export function isExplorePostId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function parseExplorePostIdFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("customer://")) {
    const rest = trimmed.slice("customer://".length);
    const [pathPart, queryPart = ""] = rest.split("?");
    const path = pathPart.replace(/^\/+/, "");
    if (path === "explore-post" || path.startsWith("explore-post/")) {
      const fromQuery = new URLSearchParams(queryPart).get("id");
      if (isExplorePostId(fromQuery)) return fromQuery.trim();
      const fromPath = path.split("/")[1];
      if (isExplorePostId(fromPath)) return fromPath.trim();
    }
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!EXPLORE_WEB_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    const segments = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (segments[0] !== "explore" || !segments[1]) return null;
    const id = decodeURIComponent(segments[1]);
    return isExplorePostId(id) ? id : null;
  } catch {
    return null;
  }
}

export function explorePostRouterTarget(postId: string): {
  pathname: "/(app)/explore-post";
  params: { id: string };
} {
  return { pathname: "/(app)/explore-post", params: { id: postId } };
}

/** Safe `return_to` string for post-login replay of an explore post deep link. */
export function explorePostReturnToPath(postId: string): string {
  return `/(app)/explore-post?id=${encodeURIComponent(postId)}`;
}

/** Resolve return_to from an in-app pathname (e.g. universal-link bridge `/explore/{id}`). */
export function parseExplorePostReturnToFromAppPath(pathname: string): string | null {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  const segments = trimmed.split("/");
  if (segments[0] !== "explore" || !segments[1]) return null;
  const id = decodeURIComponent(segments[1]);
  return isExplorePostId(id) ? explorePostReturnToPath(id) : null;
}

let pendingExplorePostReturnTo: string | null = null;

/** Stash explore post id when routing from a scheme/universal link (pathname may not include id). */
export function stashExplorePostReturnTo(postId: string): void {
  pendingExplorePostReturnTo = explorePostReturnToPath(postId);
}

export function peekExplorePostReturnTo(): string | null {
  return pendingExplorePostReturnTo;
}
